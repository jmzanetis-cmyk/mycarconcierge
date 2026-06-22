// ========== PROVIDERS BIDS MODULE ==========
// Open packages, bidding, bid calculator, filters

// ========== SERVICE TYPE FILTER ==========
if (typeof currentServiceTypeFilter === 'undefined') {
  var currentServiceTypeFilter = 'all';
}

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

let bidInsightsLoaded = false;
// 1d-3 v1: when /api/provider/packages returns { categories_required: true },
// the provider hasn't declared any match_categories yet. renderOpenPackages
// checks this flag to surface the categories-prompt UI in place of the
// generic "no packages match" empty state.
let providerCategoriesRequired = false;

// ========== LOAD OPEN PACKAGES ==========
async function loadOpenPackages() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      console.error('No session for loading packages');
      openPackages = [];
      providerCategoriesRequired = false;
      renderOpenPackages();
      renderRecentPackages();
      return;
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/provider/packages`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error loading packages:', errorData.error || response.statusText);
      openPackages = [];
      providerCategoriesRequired = false;
    } else {
      const result = await response.json();
      openPackages = result.packages || [];
      providerCategoriesRequired = !!result.categories_required;
    }

    const locationWarning = document.getElementById('location-warning');
    if (locationWarning) {
      locationWarning.style.display = !providerProfile?.zip_code ? 'block' : 'none';
    }

    renderOpenPackages();
    renderRecentPackages();
    const openCount = document.getElementById('open-count');
    if (openCount) {
      openCount.textContent = openPackages.length;
      if (openCount.textContent === '0') openCount.style.display = 'none';
      else openCount.style.display = '';
    }
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
    const { data, error } = await supabaseClient.from('bids').select('*, maintenance_packages!bids_package_id_fkey(title, status, member_id, vehicles(year, make, model))').eq('provider_id', currentUser.id).order('created_at', { ascending: false });
    if (error) {
      console.error('Error loading bids:', error);
      myBids = [];
    } else {
      myBids = data || [];
    }
    renderMyBids();
    if (typeof renderActiveJobs === 'function') renderActiveJobs();
    if (typeof updateStats === 'function') updateStats();
    if (!bidInsightsLoaded) loadBidInsights();
  } catch (err) {
    console.error('loadMyBids error:', err);
    myBids = [];
    renderMyBids();
  }
}

async function loadBidInsights() {
  const card = document.getElementById('bid-insights-card');
  const body = document.getElementById('bid-insights-body');
  if (!card || !body) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    body.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">Analyzing your bid history…</div>';
    card.style.display = 'block';

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(`${apiBase}/api/ai/bid-strategy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!resp.ok) {
      body.innerHTML = '<div style="color:var(--text-muted);">Bid insights are available once you have an active provider account with bid history.</div>';
      return;
    }

    const data = await resp.json();
    bidInsightsLoaded = true;

    if (!data.has_data) {
      body.innerHTML = `<div style="color:var(--text-muted);">${data.message || 'Submit more bids to unlock insights.'}</div>`;
      return;
    }

    const insightChips = (data.insights || []).map(i => `
      <div style="padding:8px 10px;background:var(--bg-elevated);border-radius:8px;border:1px solid var(--border-subtle);margin-bottom:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
          <strong style="font-size:0.85rem;">${i.category}</strong>
          <span style="font-size:0.8rem;font-weight:600;color:${i.win_rate >= 40 ? 'var(--accent-green)' : i.win_rate >= 20 ? 'var(--accent-gold)' : 'var(--accent-red)'};">${i.win_rate}% win rate</span>
        </div>
        <div style="font-size:0.82rem;color:var(--text-muted);">${i.tip}</div>
      </div>`).join('');

    body.innerHTML = `
      <p style="margin:0 0 10px;">${data.summary}</p>
      ${insightChips}
      ${data.top_recommendation ? `<div style="margin-top:10px;padding:10px;background:rgba(212,168,85,0.1);border:1px solid rgba(212,168,85,0.3);border-radius:8px;font-size:0.85rem;"><strong style="color:var(--accent-gold);">Top tip:</strong> ${data.top_recommendation}</div>` : ''}
    `;
  } catch (err) {
    if (card) card.style.display = 'none';
    console.log('Bid insights unavailable:', err.message);
  }
}

// ========== RENDER FUNCTIONS ==========
function renderOpenPackages(filtered = null) {
  const container = document.getElementById('open-packages');
  if (!container) return;
  
  const packagesToRender = filtered || openPackages;
  
  if (!packagesToRender.length) {
    if (providerCategoriesRequired) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">${mccIcon('settings', 40)}</div>
        <p>Set your service categories to see matching jobs.</p>
        <p style="margin-top:8px;"><a href="#" onclick="showSection('settings');return false;" style="color:var(--accent-gold);text-decoration:underline;">Open match preferences →</a></p>
      </div>`;
    } else {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('package', 40)}</div><p>No packages match your filters. Try adjusting your criteria.</p></div>`;
    }
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
  
  container.innerHTML = packagesToRender.map((p) => { return renderPackageCard(p, true); }).join('');
}

function renderRecentPackages() {
  const container = document.getElementById('recent-packages');
  if (!container) return;
  
  const recent = openPackages.slice(0, 3);
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('package', 40)}</div><p>No open packages.</p></div>`;
    return;
  }
  container.innerHTML = recent.map((p) => { return renderPackageCard(p, true); }).join('');
}

function renderPackageCard(p, showBidButton = false) {
  const vehicle = p.vehicles;
  const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Vehicle';
  const alreadyBid = myBids.some(b => b.package_id === p.id) || p._myBid;
  const myCurrentBid = p._myBid || myBids.find(b => b.package_id === p.id);
  
  const member = p.member || {};
  let memberBadgesHtml = '';
  if (member.platform_fee_exempt) {
    memberBadgesHtml += '<span class="member-badge vip">' + mccIcon('award', 16) + ' VIP</span>';
  }
  if (member.provider_verified) {
    memberBadgesHtml += '<span class="member-badge trusted">' + mccIcon('check', 16) + ' Trusted</span>';
  }
  if (member.referred_by_provider_id === currentUser?.id) {
    memberBadgesHtml += '<span class="member-badge loyal">' + mccIcon('star', 16) + ' Loyal Customer</span>';
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
      ${mccIcon('clock', 16)} ${countdown.text}
    </div>
  ` : '';
  
  const bidCount = p._bidCount || 0;
  const lowestBid = p._lowestBid;
  
  const competitionHtml = bidCount > 0 ? `
    <div style="margin-top:10px;padding:10px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
      <span style="font-size:0.85rem;">${mccIcon('trophy', 16)} <strong>${bidCount}</strong> bid${bidCount !== 1 ? 's' : ''} ${lowestBid ? `• Lowest: <strong style="color:var(--accent-gold);">$${lowestBid}</strong>` : ''}</span>
    </div>
  ` : '';

  const sanitizeText = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  const matchedBadgeHtml = p._isMatched ? `
    <div class="matched-for-you-badge">
      ${mccIcon('zap', 16)} Matched for you${p._matchReason ? ` · ${sanitizeText(p._matchReason)}` : ''}
    </div>
  ` : '';

  return `
    <div class="package-card${p._isMatched ? ' matched-package' : ''}">
      ${matchedBadgeHtml}
      <div class="package-header">
        <div>
          <div class="package-title">${p.title}${memberBadgesHtml ? `<span class="member-badges">${memberBadgesHtml}</span>` : ''}</div>
          <div class="package-vehicle">${mccIcon('car', 16)} ${vehicleName}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="package-badge">${formatCategory(p.category) || 'General'}</span>
          ${p.crowd_funded ? `<span class="package-badge" style="background:#dbeafe;color:#1d4ed8;">${mccIcon('users', 16)} Crowd Funded</span>` : ''}
        </div>
      </div>
      <div class="package-meta">
        <span>${mccIcon('map-pin', 16)} ${locationDisplay} ${distanceDisplay ? `(${distanceDisplay})` : ''}</span>
        <span>${mccIcon('refresh-cw', 16)} ${formatFrequency(p.frequency)}</span>
        <span>${mccIcon('wrench', 16)} ${p.parts_preference || 'Standard'}</span>
      </div>
      ${p.description ? `<div class="package-description">${p.description.substring(0, 150)}${p.description.length > 150 ? '...' : ''}</div>` : ''}
      ${countdownHtml}
      ${competitionHtml}
      <div class="package-footer">
        <span style="font-size:0.85rem;color:var(--text-muted);">Posted ${formatTimeAgo(p.created_at)}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="viewPackageDetails('${p.id}')">View Details</button>
          ${!alreadyBid && !biddingExpired ? `<button class="btn btn-primary btn-sm" onclick="openBidModal('${p.id}', '${p.title.replace(/'/g, "\\'")}')">Submit Bid</button>` : ''}
          ${alreadyBid ? `<span style="color:var(--accent-green);font-size:0.85rem;display:flex;align-items:center;">${mccIcon('check', 16)} Bid submitted</span>` : ''}
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
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('file-text', 40)}</div><p>No pending bids.</p></div>`;
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
            <div class="package-vehicle">${mccIcon('car', 16)} ${vehicleName}</div>
          </div>
          <span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">Pending</span>
        </div>
        <div class="package-meta">
          <span>${mccIcon('dollar-sign', 16)} Your bid: <strong>$${b.price}</strong></span>
          <span>${mccIcon('calendar', 16)} Submitted ${formatTimeAgo(b.created_at)}</span>
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border-subtle);margin-top:8px;">
          <span style="font-size:0.82rem;color:var(--text-muted);font-weight:600;">Competing bid alerts:</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
            <div class="calc-toggle-switch">
              <input type="checkbox" id="notify-sms-${b.id}" ${b.provider_bid_alerts_sms ? 'checked' : ''} onchange="updateBidAlerts('${b.id}', 'sms', this.checked)">
              <span class="calc-toggle-slider"></span>
            </div>
            Text
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
            <div class="calc-toggle-switch">
              <input type="checkbox" id="notify-email-${b.id}" ${b.provider_bid_alerts_email ? 'checked' : ''} onchange="updateBidAlerts('${b.id}', 'email', this.checked)">
              <span class="calc-toggle-slider"></span>
            </div>
            Email
          </label>
        </div>
        <div class="package-footer">
          <span></span>
          <button class="btn btn-secondary btn-sm" onclick="openBidModal('${b.package_id}', '${(pkg?.title || 'Package').replace(/'/g, "\\'")}', ${b.price})">Update Bid</button>
        </div>
      </div>
    `;
  }).join('');
}

async function updateBidAlerts(bidId, channel, value) {
  try {
    const col = channel === 'sms' ? 'provider_bid_alerts_sms' : 'provider_bid_alerts_email';
    const { error } = await supabaseClient.from('bids').update({ [col]: value }).eq('id', bidId);
    if (error) throw error;
  } catch (err) {
    console.error('Failed to update bid alert preference:', err);
    showToast('Could not save alert preference', 'error');
    const el = document.getElementById(`notify-${channel}-${bidId}`);
    if (el) el.checked = !value;
  }
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
      return dist <= Number.parseInt(distance);
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
    filtered.sort((a, b) => {
      if (a._isMatched && !b._isMatched) return -1;
      if (!a._isMatched && b._isMatched) return 1;
      return (a._estimatedDistance || 999) - (b._estimatedDistance || 999);
    });
  } else if (sort === 'newest') {
    filtered.sort((a, b) => {
      if (a._isMatched && !b._isMatched) return -1;
      if (!a._isMatched && b._isMatched) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
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
    return Math.abs(Number.parseInt(zip1) - Number.parseInt(zip2)) * 0.5;
  }
  const diff = Math.abs(Number.parseInt(zip1.substring(0, 3)) - Number.parseInt(zip2.substring(0, 3)));
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
          <span>${mccIcon('car', 16)} ${vehicleName}</span>
          <span>${mccIcon('map-pin', 16)} ${locationDisplay}</span>
          <span>${mccIcon('calendar', 16)} Posted ${new Date(pkg.created_at).toLocaleDateString()}</span>
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
          <span>${mccIcon('refresh-cw', 16)} ${formatFrequency(pkg.frequency)}</span>
          <span>${mccIcon('wrench', 16)} ${pkg.parts_preference || 'Standard'} parts</span>
          <span>${mccIcon('car', 16)} ${formatPickup(pkg.pickup_preference)}</span>
        </div>
      </div>
      ${pkg.fitment_specs?.snow_removal_details ? `<div style="margin-bottom:20px;">
        <strong>${mccIcon('map-pin', 16)} Property Details</strong>
        <div class="package-meta" style="margin-top:8px;">
          <span>Address: ${pkg.fitment_specs.snow_removal_details.property_address}</span>
          <span>Type: ${(pkg.fitment_specs.snow_removal_details.property_type || '').replace(/_/g, ' ')}</span>
          <span>Size: ${(pkg.fitment_specs.snow_removal_details.property_size || '').replace(/_/g, ' ')}</span>
        </div>
      </div>` : ''}
      ${pkg.description ? `<div style="margin-bottom:20px;"><strong>Description</strong><p style="color:var(--text-secondary);margin-top:8px;line-height:1.6;">${pkg.description}</p></div>` : ''}
      ${photos?.length ? `
        <div style="margin-bottom:20px;">
          <strong>${mccIcon('camera', 16)} Photos (${photos.length})</strong>
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
        ${!myBids.some(b => b.package_id === packageId) ? `<button class="btn btn-primary" onclick="closeModal('package-details-modal');openBidModal('${packageId}', '${pkg.title.replace(/'/g, "\\'")}')">Submit Bid</button>` : `<span style="color:var(--accent-green);">${mccIcon('check', 16)} You've already bid on this package</span>`}
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

  const notifySms = document.getElementById('bid-notify-sms');
  const notifyEmail = document.getElementById('bid-notify-email');
  if (notifySms) notifySms.checked = false;
  if (notifyEmail) notifyEmail.checked = false;
  
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
  
  if (!price || isNaN(Number.parseFloat(price))) {
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
          .update({ price: Number.parseFloat(price), notes, estimated_duration: duration })
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
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const response = await fetch(`${apiBase}/api/bids`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          package_id: currentBidPackageId,
          price: Number.parseFloat(price),
          notes,
          estimated_duration: duration,
          availability,
          provider_notify_sms: document.getElementById('bid-notify-sms')?.checked || false,
          provider_notify_email: document.getElementById('bid-notify-email')?.checked || false
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

const PLATFORM_FEE_PERCENT = 0;
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
  const parts = Number.parseFloat(document.getElementById('calc-parts')?.value) || 0;
  const laborHours = Number.parseFloat(document.getElementById('calc-labor-hours')?.value) || 0;
  const laborRate = Number.parseFloat(document.getElementById('calc-labor-rate')?.value) || 75;
  const profitMargin = Number.parseFloat(document.getElementById('calc-profit-margin')?.value) || 20;
  const travelEnabled = document.getElementById('calc-travel-enabled')?.checked;
  const travel = travelEnabled ? (Number.parseFloat(document.getElementById('calc-travel')?.value) || 0) : 0;
  const transportEnabled = document.getElementById('calc-transport-enabled')?.checked;
  const transport = transportEnabled ? (Number.parseFloat(document.getElementById('calc-transport')?.value) || 0) : 0;
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
  const total = Number.parseFloat(totalDisplay?.textContent?.replace('$', '') || '0');
  
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
    'airport': mccIcon('send', 16),
    'dealership': mccIcon('store', 16),
    'valet': mccIcon('star', 16),
    'detailing': mccIcon('sparkles', 16),
    'transport': mccIcon('truck', 16)
  };
  return icons[type] || mccIcon('car', 16);
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

// ========== SERVICE CREDITS ==========
let bidPacks = [];

async function loadServiceCredits() {
  try {
    const { data: packs, error: packsError } = await supabaseClient
      .from('bid_packs')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (packsError) {
      console.error('Error fetching service credits:', packsError);
      const container = document.getElementById('bid-packs-grid');
      if (container) {
        container.innerHTML = `<p style="color:var(--accent-red);">Error loading service credits: ${packsError.message}</p>`;
      }
      return;
    }
    
    bidPacks = packs || [];
    renderServiceCredits();
    renderCreditBalance();

    const { data: purchases } = await supabaseClient
      .from('bid_credit_purchases')
      .select('*, bid_packs(name)')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    renderPurchaseHistory(purchases || []);
    updateCreditsBadge();

  } catch (err) {
    console.error('Error loading service credits:', err);
    const container = document.getElementById('bid-packs-grid');
    if (container) {
      container.innerHTML = `<p style="color:var(--accent-red);">Error loading service credits. Please refresh.</p>`;
    }
  }
}

function renderCreditBalance() {
  const credits = providerProfile?.bid_credits || 0;
  const freeBids = providerProfile?.free_trial_bids || 0;
  const totalPurchased = providerProfile?.total_bids_purchased || 0;
  const totalUsed = providerProfile?.total_bids_used || 0;
  const totalAvailable = credits + freeBids;

  const creditsBalance = document.getElementById('credits-balance');
  const browseCreditsCount = document.getElementById('browse-credits-count');
  const freeRemaining = document.getElementById('free-bids-remaining');
  const totalPurchasedEl = document.getElementById('total-purchased');
  const totalUsedEl = document.getElementById('total-used');

  if (creditsBalance) creditsBalance.textContent = totalAvailable;
  if (browseCreditsCount) browseCreditsCount.textContent = totalAvailable;
  if (freeRemaining) freeRemaining.textContent = freeBids;
  if (totalPurchasedEl) totalPurchasedEl.textContent = totalPurchased;
  if (totalUsedEl) totalUsedEl.textContent = totalUsed;

  const lowWarning = document.getElementById('low-credits-warning');
  const noWarning = document.getElementById('no-credits-warning');
  
  if (lowWarning) lowWarning.style.display = 'none';
  if (noWarning) noWarning.style.display = 'none';

  if (totalAvailable === 0) {
    if (noWarning) noWarning.style.display = 'block';
  } else if (totalAvailable <= 3) {
    if (lowWarning) lowWarning.style.display = 'block';
  }

  if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    [lowWarning, noWarning].forEach(function(w) {
      if (!w) return;
      const btn = w.querySelector('button');
      if (btn) btn.style.display = 'none';
    });
  }
}

function renderServiceCredits() {
  const container = document.getElementById('bid-packs-grid');
  if (!container) return;

  if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px 0;">Service credit purchases are available on the web — sign in at <strong>mycarconcierge.com</strong> to add credits.</p>';
    return;
  }

  if (!bidPacks.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">No service credit packs available.</p>';
    return;
  }

  const sortedPacks = [...bidPacks].sort((a, b) => b.price - a.price);
  const basePerCredit = 10.00;
  
  const renderPackCard = (pack) => {
    const totalCredits = pack.bid_count + (pack.bonus_bids || 0);
    const effectivePriceNum = pack.price / totalCredits;
    const effectivePrice = effectivePriceNum.toFixed(2);
    const savingsPercent = Math.max(0, Math.round((1 - (effectivePriceNum / basePerCredit)) * 100));
    const hasBadge = pack.badge_text || pack.is_popular;
    const badgeText = pack.badge_text || (pack.is_popular ? 'POPULAR' : '');
    
    return `
      <div style="background:var(--bg-elevated);border:2px solid ${hasBadge ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-lg);padding:20px;position:relative;text-align:center;">
        ${badgeText ? `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent-gold);color:#0a0a0f;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:100px;">${badgeText}</div>` : ''}
        <div style="font-size:2.5rem;margin-bottom:8px;">${mccIcon('ticket', 40)}</div>
        <h3 style="font-size:1.2rem;font-weight:600;margin-bottom:4px;">${pack.name}</h3>
        <div style="margin:16px 0;">
          <span style="font-size:2rem;font-weight:700;">${pack.bid_count.toLocaleString()}</span>
          <span style="color:var(--text-muted);"> credits</span>
          ${pack.bonus_bids > 0 ? `<div style="color:var(--accent-green);font-size:0.9rem;font-weight:500;">+${pack.bonus_bids} FREE bonus!</div>` : ''}
        </div>
        <div style="font-size:1.5rem;font-weight:600;color:var(--accent-gold);margin-bottom:4px;">$${pack.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">$${effectivePrice} per credit</div>
        ${savingsPercent > 0 ? `<div style="font-size:0.85rem;color:var(--accent-green);font-weight:500;margin-bottom:12px;">Save ${savingsPercent}%</div>` : '<div style="margin-bottom:12px;"></div>'}
        <button class="btn ${hasBadge ? 'btn-primary' : 'btn-secondary'}" style="width:100%;" onclick="purchaseBidPack('${pack.id}')">Buy Now</button>
      </div>
    `;
  };
  
  const topPacks = sortedPacks.slice(0, 6);
  const morePacks = sortedPacks.slice(6);
  
  let html = topPacks.map(renderPackCard).join('');
  
  if (morePacks.length > 0) {
    html += `
      <div id="more-packs-section" style="grid-column: 1 / -1;">
        <button id="toggle-more-packs" onclick="toggleMorePacks()" style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-secondary);cursor:pointer;font-size:0.95rem;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span>View ${morePacks.length} more packs</span>
          <span id="more-packs-arrow" style="transition:transform 0.2s;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div id="more-packs-grid" style="display:none;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:16px;">
          ${morePacks.map(renderPackCard).join('')}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

window.toggleMorePacks = function() {
  const grid = document.getElementById('more-packs-grid');
  const arrow = document.getElementById('more-packs-arrow');
  const btn = document.getElementById('toggle-more-packs');
  if (!grid || !arrow || !btn) return;
  const isHidden = grid.style.display === 'none';
  
  grid.style.display = isHidden ? 'grid' : 'none';
  arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  btn.querySelector('span:first-child').textContent = isHidden ? 'Show fewer packs' : `View ${document.querySelectorAll('#more-packs-grid > div').length} more packs`;
};

function renderPurchaseHistory(purchases) {
  const container = document.getElementById('purchase-history');
  if (!container) return;
  
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
            <td style="padding:12px 8px;">${p.bid_packs?.name || 'Credit Pack'}</td>
            <td style="padding:12px 8px;">${p.bids_purchased}${p.bonus_bids > 0 ? ` <span style="color:var(--accent-green);">+${p.bonus_bids}</span>` : ''}</td>
            <td style="padding:12px 8px;text-align:right;">$${p.amount_paid.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function updateCreditsBadge() {
  const badge = document.getElementById('sub-badge');
  if (!badge) return;
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

// ========== BID PACK PURCHASE ==========
const STRIPE_CHECKOUT_URL = '/.netlify/functions/create-bid-checkout';
const USE_STRIPE = true;

async function purchaseBidPack(packId) {
  const pack = bidPacks.find(p => p.id === packId);
  if (!pack) return;

  if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    showToast('Bid credits are purchased on the web — visit mycarconcierge.com to add credits.', 'warning');
    return;
  }

  const totalBids = pack.bid_count + (pack.bonus_bids || 0);

  if (!confirm(`Purchase ${pack.name} pack?\n\n${pack.bid_count} bids${pack.bonus_bids > 0 ? ` + ${pack.bonus_bids} bonus` : ''} = ${totalBids} total bids\nPrice: $${pack.price.toFixed(2)}\n\nYou'll be redirected to complete payment.`)) {
    return;
  }

  const walletStatus = typeof isMobileWalletAvailable === 'function' ? await isMobileWalletAvailable() : { available: false };

  if (walletStatus.available) {
    try {
      const description = `${pack.name} - ${totalBids} Bid Credits`;
      const walletResult = await payWithMobileWallet(pack.price, description);

      if (walletResult.success && walletResult.paymentMethodId) {
        showToast('Processing payment...', 'success');

        const session = await supabaseClient.auth.getSession();
        const response = await fetch('/api/create-bid-checkout-mobile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`
          },
          body: JSON.stringify({
            packId: pack.id,
            providerId: currentUser.id,
            paymentMethodId: walletResult.paymentMethodId,
            walletType: walletResult.type
          })
        });

        const data = await response.json();
        if (data.success) {
          showToast(`${totalBids} bid credits added to your account!`, 'success');
          await loadSubscription();
          return;
        } else {
          throw new Error(data.error || 'Payment failed');
        }
      } else if (walletResult.error && walletResult.error !== 'Payment cancelled') {
        console.log('Mobile wallet payment failed, falling back to Stripe Checkout');
      }
    } catch (err) {
      console.error('Mobile wallet error:', err);
      showToast('Mobile payment failed. Redirecting to standard checkout...', 'error');
    }
  }

  if (USE_STRIPE) {
    try {
      showToast('Redirecting to checkout...', 'success');

      const session = await supabaseClient.auth.getSession();
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

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error('No checkout URL returned');

      window.location.href = data.url;

    } catch (err) {
      console.error('Checkout error:', err);
      showToast('Failed to start checkout: ' + err.message, 'error');
    }
    return;
  }

  try {
    const { error: purchaseError } = await supabaseClient.from('bid_credit_purchases').insert({
      provider_id: currentUser.id,
      pack_id: packId,
      bids_purchased: pack.bid_count,
      bonus_bids: pack.bonus_bids || 0,
      amount_paid: pack.price,
      status: 'completed'
    });

    if (purchaseError) throw purchaseError;

    const newCredits = (providerProfile?.bid_credits || 0) + totalBids;
    const newTotalPurchased = (providerProfile?.total_bids_purchased || 0) + totalBids;

    await supabaseClient.from('profiles').update({
      bid_credits: newCredits,
      total_bids_purchased: newTotalPurchased
    }).eq('id', currentUser.id);

    providerProfile.bid_credits = newCredits;
    providerProfile.total_bids_purchased = newTotalPurchased;

    showToast(`${totalBids} bid credits added to your account!`, 'success');
    await loadSubscription();

  } catch (err) {
    console.error('Purchase error:', err);
    showToast('Failed to process purchase. Please try again.', 'error');
  }
}

function checkPurchaseStatus() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('purchase') === 'success') {
    showToast('Purchase successful! Credits added to your account.', 'success');
    window.history.replaceState({}, '', 'providers.html');
    setTimeout(() => loadSubscription(), 1000);
  } else if (params.get('purchase') === 'cancelled') {
    showToast('Purchase cancelled.', 'error');
    window.history.replaceState({}, '', 'providers.html');
  }
}

// ========== BID INSIGHTS ===window.loadServiceCredits = loadServiceCredits;
window.loadOpenPackages = loadOpenPackages;
window.loadMyBids = loadMyBids;
window.purchaseBidPack = purchaseBidPack;
window.checkPurchaseStatus = checkPurchaseStatus;
window.loadBidInsights = loadBidInsights;
window.loadAIPriceSuggestion = loadAIPriceSuggestion;
window.draftBidPitch = draftBidPitch;

console.log('providers-bids.js loaded');
