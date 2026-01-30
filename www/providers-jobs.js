// ========== PROVIDERS JOBS MODULE ==========
// Active jobs, GPS tracking, evidence, inspections, emergency, fleet

// ========== ACTIVE JOBS ==========
function renderActiveJobs() {
  const container = document.getElementById('active-jobs');
  if (!container) return;
  
  const activeJobs = myBids.filter(b => b.status === 'accepted');
  
  if (!activeJobs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔧</div><p>No active jobs. Win bids to see your jobs here!</p></div>';
    return;
  }
  
  container.innerHTML = activeJobs.map(job => {
    const pkg = job.maintenance_packages;
    const vehicle = pkg?.vehicles;
    const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
    const isTracking = activeTrackingPackageId === job.package_id;
    
    return `
      <div class="package-card" style="border-left:4px solid var(--accent-green);">
        <div class="package-header">
          <div>
            <div class="package-title">${pkg?.title || 'Job'}</div>
            <div class="package-vehicle">🚗 ${vehicleName}</div>
          </div>
          <span class="package-badge" style="background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
        </div>
        <div class="package-meta">
          <span>💰 Your bid: <strong>$${job.price}</strong></span>
          <span>📅 Accepted ${formatTimeAgo(job.updated_at || job.created_at)}</span>
        </div>
        <div class="package-footer">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="openMessageModal('${pkg?.member_id}', '${job.package_id}')">💬 Message</button>
            ${isTracking 
              ? `<button class="btn btn-sm" style="background:var(--accent-red);color:#fff;" onclick="stopGpsTracking()">🛑 Stop Tracking</button>`
              : `<button class="btn btn-sm" style="background:var(--accent-blue);color:#fff;" onclick="startGpsTracking('${job.package_id}')">📍 Start GPS</button>`
            }
            <button class="btn btn-primary btn-sm" onclick="openCompleteJobModal('${job.package_id}')">✅ Complete</button>
            <div class="dropdown" style="position:relative;">
              <button class="btn btn-secondary btn-sm" onclick="toggleJobActionsMenu('${job.package_id}')">⋮ More</button>
              <div class="dropdown-menu" id="job-actions-menu-${job.package_id}" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:50;min-width:180px;">
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="openAdditionalWorkModal('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">🔧 Request Additional Work</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="openDiscountModal('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">💰 Offer Discount</button>
                <hr style="margin:4px 0;border:none;border-top:1px solid var(--border-subtle);">
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="viewAdditionalWorkRequests('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">📋 View Additional Work</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="viewDiscountsOffered('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">🎁 View Discounts</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ========== GPS TRACKING ==========
async function startGpsTracking(packageId) {
  if (!navigator.geolocation) {
    showToast('GPS not available on this device', 'error');
    return;
  }
  
  activeTrackingPackageId = packageId;
  
  try {
    trackingWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        lastTrackingPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString()
        };
        
        await sendLocationUpdate(packageId, lastTrackingPosition);
      },
      (error) => {
        console.error('GPS error:', error);
        showToast('GPS error: ' + error.message, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    
    trackingIntervalId = setInterval(async () => {
      if (lastTrackingPosition) {
        await sendLocationUpdate(packageId, lastTrackingPosition);
      }
    }, 30000);
    
    showToast('GPS tracking started', 'success');
    if (typeof renderActiveJobs === 'function') renderActiveJobs();
    
  } catch (err) {
    console.error('Start tracking error:', err);
    showToast('Failed to start tracking', 'error');
  }
}

function stopGpsTracking() {
  if (trackingWatchId) {
    navigator.geolocation.clearWatch(trackingWatchId);
    trackingWatchId = null;
  }
  
  if (trackingIntervalId) {
    clearInterval(trackingIntervalId);
    trackingIntervalId = null;
  }
  
  activeTrackingPackageId = null;
  lastTrackingPosition = null;
  
  showToast('GPS tracking stopped', 'success');
  if (typeof renderActiveJobs === 'function') renderActiveJobs();
}

async function sendLocationUpdate(packageId, position) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    await fetch('/api/tracking/update', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        package_id: packageId,
        latitude: position.lat,
        longitude: position.lng,
        accuracy: position.accuracy
      })
    });
  } catch (err) {
    console.log('Location update error:', err);
  }
}

// ========== MESSAGING ==========
function openMessageModal(memberId, packageId) {
  currentMessageMemberId = memberId;
  currentMessagePackageId = packageId;
  
  const textarea = document.getElementById('message-text');
  if (textarea) textarea.value = '';
  
  loadConversation(memberId, packageId);
  openModal('message-modal');
}

async function loadConversation(memberId, packageId) {
  const container = document.getElementById('message-history');
  if (!container) return;
  
  try {
    const { data } = await supabaseClient
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${memberId}),and(sender_id.eq.${memberId},recipient_id.eq.${currentUser.id})`)
      .eq('package_id', packageId)
      .order('created_at', { ascending: true });
    
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No messages yet. Start the conversation!</p>';
      return;
    }
    
    container.innerHTML = data.map(m => `
      <div style="margin-bottom:12px;${m.sender_id === currentUser.id ? 'text-align:right;' : ''}">
        <div style="display:inline-block;max-width:80%;padding:12px 16px;border-radius:12px;${m.sender_id === currentUser.id ? 'background:var(--accent-gold-soft);' : 'background:var(--bg-elevated);'}">
          <p style="margin:0;">${m.content}</p>
          <span style="font-size:0.75rem;color:var(--text-muted);">${formatTimeAgo(m.created_at)}</span>
        </div>
      </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error('Load conversation error:', err);
  }
}

async function sendMessage() {
  const textarea = document.getElementById('message-text');
  const content = textarea?.value?.trim();
  
  if (!content) {
    showToast('Please enter a message', 'error');
    return;
  }
  
  try {
    const { error } = await supabaseClient.from('messages').insert({
      sender_id: currentUser.id,
      recipient_id: currentMessageMemberId,
      package_id: currentMessagePackageId,
      content
    });
    
    if (error) throw error;
    
    textarea.value = '';
    await loadConversation(currentMessageMemberId, currentMessagePackageId);
    showToast('Message sent!', 'success');
  } catch (err) {
    console.error('Send message error:', err);
    showToast('Failed to send message', 'error');
  }
}

// ========== COMPLETE JOB ==========
function openCompleteJobModal(packageId) {
  document.getElementById('complete-job-package-id').value = packageId;
  document.getElementById('completion-notes').value = '';
  
  const photosContainer = document.getElementById('completion-photos');
  if (photosContainer) photosContainer.innerHTML = '';
  
  openModal('complete-job-modal');
}

async function submitJobCompletion() {
  const packageId = document.getElementById('complete-job-package-id')?.value;
  const notes = document.getElementById('completion-notes')?.value || '';
  
  if (!packageId) {
    showToast('Invalid job', 'error');
    return;
  }
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch('/api/jobs/complete', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        package_id: packageId,
        completion_notes: notes
      })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to complete job');
    
    closeModal('complete-job-modal');
    showToast('Job marked as complete! Awaiting member confirmation.', 'success');
    
    if (activeTrackingPackageId === packageId) {
      stopGpsTracking();
    }
    
    await loadMyBids();
    
  } catch (err) {
    console.error('Complete job error:', err);
    showToast(err.message || 'Failed to complete job', 'error');
  }
}

// ========== ADDITIONAL WORK & DISCOUNTS ==========
function toggleJobActionsMenu(packageId) {
  const menu = document.getElementById(`job-actions-menu-${packageId}`);
  if (!menu) return;
  
  document.querySelectorAll('.dropdown-menu').forEach(m => {
    if (m.id !== `job-actions-menu-${packageId}`) {
      m.style.display = 'none';
    }
  });
  
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  }
});

function openAdditionalWorkModal(packageId) {
  document.getElementById('additional-work-package-id').value = packageId;
  document.getElementById('additional-work-description').value = '';
  document.getElementById('additional-work-cost').value = '';
  document.getElementById('additional-work-photos').value = '';
  openModal('additional-work-modal');
}

async function submitAdditionalWorkRequest() {
  const packageId = document.getElementById('additional-work-package-id')?.value;
  const description = document.getElementById('additional-work-description')?.value?.trim();
  const estimatedCost = parseFloat(document.getElementById('additional-work-cost')?.value) || 0;
  const photosInput = document.getElementById('additional-work-photos');
  
  if (!packageId) {
    showToast('Invalid package', 'error');
    return;
  }
  
  if (!description) {
    showToast('Please enter a description', 'error');
    return;
  }
  
  if (estimatedCost <= 0) {
    showToast('Please enter a valid estimated cost', 'error');
    return;
  }
  
  try {
    const photos = [];
    if (photosInput?.files?.length > 0) {
      for (let i = 0; i < photosInput.files.length; i++) {
        const file = photosInput.files[i];
        const base64 = await fileToBase64(file);
        photos.push(base64);
      }
    }
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch('/api/additional-work/request', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        package_id: packageId,
        description,
        estimated_cost: estimatedCost,
        photos
      })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to submit request');
    
    closeModal('additional-work-modal');
    showToast('Additional work request submitted! The member will be notified.', 'success');
    
  } catch (err) {
    console.error('Submit additional work error:', err);
    showToast(err.message || 'Failed to submit request', 'error');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function openDiscountModal(packageId) {
  document.getElementById('discount-package-id').value = packageId;
  document.getElementById('discount-amount').value = '';
  document.getElementById('discount-type').value = 'fixed';
  document.getElementById('discount-reason').value = '';
  openModal('discount-modal');
}

async function submitDiscountOffer() {
  const packageId = document.getElementById('discount-package-id')?.value;
  const discountAmount = parseFloat(document.getElementById('discount-amount')?.value) || 0;
  const discountType = document.getElementById('discount-type')?.value || 'fixed';
  const reason = document.getElementById('discount-reason')?.value?.trim() || '';
  
  if (!packageId) {
    showToast('Invalid package', 'error');
    return;
  }
  
  if (discountAmount <= 0) {
    showToast('Please enter a valid discount amount', 'error');
    return;
  }
  
  if (discountType === 'percentage' && discountAmount > 100) {
    showToast('Percentage discount cannot exceed 100%', 'error');
    return;
  }
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch('/api/discount/offer', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        package_id: packageId,
        discount_amount: discountAmount,
        discount_type: discountType,
        reason
      })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to offer discount');
    
    closeModal('discount-modal');
    showToast('Discount offered! The member will be notified.', 'success');
    
  } catch (err) {
    console.error('Submit discount error:', err);
    showToast(err.message || 'Failed to offer discount', 'error');
  }
}

async function viewAdditionalWorkRequests(packageId) {
  const container = document.getElementById('additional-work-list');
  if (!container) return;
  
  container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Loading...</p>';
  openModal('view-additional-work-modal');
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch(`/api/additional-work/${packageId}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to load requests');
    
    const requests = result.requests || result || [];
    
    if (!requests.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">📋</div><p>No additional work requests for this job</p></div>';
      return;
    }
    
    const statusBadges = {
      'pending': { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', label: 'Pending' },
      'approved': { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', label: 'Approved' },
      'declined': { bg: 'var(--accent-red-soft)', color: 'var(--accent-red)', label: 'Declined' }
    };
    
    container.innerHTML = requests.map(req => {
      const status = statusBadges[req.status] || statusBadges['pending'];
      return `
        <div style="padding:16px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;background:var(--bg-input);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <span style="font-weight:600;">$${parseFloat(req.estimated_cost || 0).toFixed(2)}</span>
            <span style="padding:4px 12px;border-radius:100px;font-size:0.8rem;background:${status.bg};color:${status.color};">${status.label}</span>
          </div>
          <p style="margin:0 0 8px 0;color:var(--text-secondary);font-size:0.9rem;">${req.description || 'No description'}</p>
          <span style="font-size:0.8rem;color:var(--text-muted);">Requested ${formatTimeAgo(req.created_at)}</span>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Load additional work requests error:', err);
    container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">⚠️</div><p>Failed to load requests</p></div>';
  }
}

async function viewDiscountsOffered(packageId) {
  const container = document.getElementById('discounts-list');
  if (!container) return;
  
  container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Loading...</p>';
  openModal('view-discounts-modal');
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch(`/api/discounts/${packageId}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to load discounts');
    
    const discounts = result.discounts || result || [];
    
    if (!discounts.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">💰</div><p>No discounts offered for this job</p></div>';
      return;
    }
    
    const statusBadges = {
      'offered': { bg: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', label: 'Offered' },
      'accepted': { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', label: 'Accepted' },
      'declined': { bg: 'var(--accent-red-soft)', color: 'var(--accent-red)', label: 'Declined' },
      'applied': { bg: 'var(--accent-gold-soft)', color: 'var(--accent-gold)', label: 'Applied' }
    };
    
    container.innerHTML = discounts.map(disc => {
      const status = statusBadges[disc.status] || statusBadges['offered'];
      const amountDisplay = disc.discount_type === 'percentage' 
        ? `${disc.discount_amount}%` 
        : `$${parseFloat(disc.discount_amount || 0).toFixed(2)}`;
      
      return `
        <div style="padding:16px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;background:var(--bg-input);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <span style="font-weight:600;color:var(--accent-green);">${amountDisplay} off</span>
            <span style="padding:4px 12px;border-radius:100px;font-size:0.8rem;background:${status.bg};color:${status.color};">${status.label}</span>
          </div>
          ${disc.reason ? `<p style="margin:0 0 8px 0;color:var(--text-secondary);font-size:0.9rem;">${disc.reason}</p>` : ''}
          <span style="font-size:0.8rem;color:var(--text-muted);">Offered ${formatTimeAgo(disc.created_at)}</span>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Load discounts error:', err);
    container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">⚠️</div><p>Failed to load discounts</p></div>';
  }
}

// ========== EMERGENCY FUNCTIONS ==========
function setupEmergencySettings() {
  const acceptCheckbox = document.getElementById('emergency-accept-calls');
  const detailsSection = document.getElementById('emergency-settings-details');
  
  if (acceptCheckbox) {
    acceptCheckbox.addEventListener('change', () => {
      if (detailsSection) detailsSection.style.display = acceptCheckbox.checked ? 'block' : 'none';
    });
    
    if (providerProfile?.emergency_enabled) {
      acceptCheckbox.checked = true;
      if (detailsSection) detailsSection.style.display = 'block';
    }
    
    if (providerProfile?.emergency_services) {
      providerProfile.emergency_services.forEach(svc => {
        const cb = document.querySelector(`.emergency-service-check[value="${svc}"]`);
        if (cb) cb.checked = true;
      });
    }
    
    if (providerProfile?.emergency_radius) {
      const radiusEl = document.getElementById('emergency-radius');
      if (radiusEl) radiusEl.value = providerProfile.emergency_radius;
    }
    if (providerProfile?.is_24_seven) {
      const el = document.getElementById('emergency-24-7');
      if (el) el.checked = true;
    }
    if (providerProfile?.can_tow) {
      const el = document.getElementById('emergency-can-tow');
      if (el) el.checked = true;
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
    if (noticeEl) noticeEl.style.display = 'block';
    if (queueEl) queueEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">Enable emergency services in your profile to see requests.</p></div>';
    return;
  }
  
  if (noticeEl) noticeEl.style.display = 'none';
  
  const location = await getProviderLocation();
  if (!location) {
    if (queueEl) queueEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">📍 Enable location to see nearby emergencies</p></div>';
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
    if (queueEl) queueEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load emergencies</p></div>';
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
  if (!badge) return;
  
  const count = nearbyEmergencies.length;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function renderEmergencyQueue() {
  const container = document.getElementById('emergency-queue');
  if (!container) return;
  
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
    
    return `
      <div class="emergency-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <span class="emergency-type-badge">${typeLabels[e.emergency_type] || e.emergency_type}</span>
            <div style="margin-top:8px;">
              <span class="emergency-distance">📍 ${distance}</span>
              <span class="emergency-time" style="margin-left:12px;">⏱️ ${timeAgo}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem;font-weight:600;color:var(--accent-green);margin-top:4px;">💰 ${escrowAmount}</div>
          </div>
        </div>
        ${e.address ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">${e.address}</div>` : ''}
        <div class="emergency-actions">
          <button class="btn btn-emergency" onclick="openAcceptEmergency('${e.id}')" ${!hasCredits ? 'disabled style="opacity:0.5;"' : ''}>🚗 Claim Emergency</button>
          <button class="btn btn-secondary" onclick="viewEmergencyDetails('${e.id}')">View Details</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderMyActiveEmergency() {
  const container = document.getElementById('my-active-emergency');
  if (!container) return;
  
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
  
  container.innerHTML = `
    <div class="emergency-card active" style="border:2px solid var(--accent-green);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <span class="emergency-type-badge" style="background:var(--accent-green);color:#fff;">${typeLabels[e.emergency_type] || e.emergency_type}</span>
          <div style="margin-top:8px;font-weight:600;">${memberName}</div>
        </div>
        <span style="background:var(--accent-green-soft);color:var(--accent-green);padding:4px 12px;border-radius:100px;font-size:0.85rem;text-transform:capitalize;">${e.status}</span>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:0.9rem;color:var(--text-secondary);">🚗 ${vehicleName}</div>
        ${memberPhone ? `<div style="font-size:0.9rem;color:var(--text-secondary);">📞 ${memberPhone}</div>` : ''}
        ${e.address ? `<div style="font-size:0.9rem;color:var(--text-secondary);">📍 ${e.address}</div>` : ''}
      </div>
      <div class="emergency-actions">
        <button class="btn btn-primary" onclick="updateMyEmergencyStatus('${e.id}', 'completed')">✅ Mark Complete</button>
        ${memberPhone ? `<a href="tel:${memberPhone}" class="btn btn-secondary">📞 Call</a>` : ''}
      </div>
    </div>
  `;
}

async function openAcceptEmergency(emergencyId) {
  const emergency = nearbyEmergencies.find(e => e.id === emergencyId);
  if (!emergency) return;
  
  const confirmMsg = `Accept this emergency request?\n\nType: ${emergency.emergency_type}\nDistance: ${emergency.distance_miles?.toFixed(1) || '?'} miles\n\nThis will use 1 bid credit.`;
  
  if (!confirm(confirmMsg)) return;
  
  try {
    const { error } = await supabaseClient
      .from('emergency_requests')
      .update({
        assigned_provider_id: currentUser.id,
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', emergencyId);
    
    if (error) throw error;
    
    const freeTrialBids = providerProfile?.free_trial_bids || 0;
    const bidCredits = providerProfile?.bid_credits || 0;
    
    if (freeTrialBids > 0) {
      await supabaseClient.from('profiles').update({ free_trial_bids: freeTrialBids - 1 }).eq('id', currentUser.id);
    } else if (bidCredits > 0) {
      await supabaseClient.from('profiles').update({ bid_credits: bidCredits - 1 }).eq('id', currentUser.id);
    }
    
    showToast('Emergency accepted! Contact the member ASAP.', 'success');
    await refreshEmergencies();
    if (typeof loadProviderProfile === 'function') loadProviderProfile();
    if (typeof updateStats === 'function') updateStats();
    
  } catch (err) {
    console.error('Accept emergency error:', err);
    showToast('Failed to accept emergency: ' + err.message, 'error');
  }
}

function viewEmergencyDetails(emergencyId) {
  const emergency = nearbyEmergencies.find(e => e.id === emergencyId);
  if (!emergency) return;
  
  const typeLabels = {
    'flat_tire': '🛞 Flat Tire',
    'dead_battery': '🔋 Dead Battery',
    'lockout': '🔐 Locked Out',
    'tow_needed': '🚛 Tow Needed',
    'fuel_delivery': '⛽ Out of Fuel',
    'accident': '💥 Accident',
    'other': '❓ Other'
  };
  
  alert(`Emergency Details\n\nType: ${typeLabels[emergency.emergency_type] || emergency.emergency_type}\nDistance: ${emergency.distance_miles?.toFixed(1) || '?'} miles\nAddress: ${emergency.address || 'Not provided'}\n\nDescription: ${emergency.description || 'None provided'}`);
}

async function updateMyEmergencyStatus(emergencyId, newStatus) {
  try {
    const updates = { status: newStatus };
    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    
    const { error } = await supabaseClient
      .from('emergency_requests')
      .update(updates)
      .eq('id', emergencyId);
    
    if (error) throw error;
    
    showToast(`Emergency ${newStatus}!`, 'success');
    await refreshEmergencies();
    
  } catch (err) {
    console.error('Update emergency error:', err);
    showToast('Failed to update: ' + err.message, 'error');
  }
}

// ========== DESTINATION TASKS ==========
async function loadDestinationTasks() {
  const container = document.getElementById('destination-tasks');
  if (!container) return;
  
  try {
    const { data } = await supabaseClient
      .from('bids')
      .select('*, maintenance_packages!bids_package_id_fkey(*, vehicles(year, make, model), destination_services(*))')
      .eq('provider_id', currentUser.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });
    
    const destinationJobs = (data || []).filter(b => {
      const pkg = b.maintenance_packages;
      return pkg?.category === 'destination_service' || pkg?.is_destination_service;
    });
    
    if (!destinationJobs.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✈️</div><p>No destination service jobs yet.</p></div>';
      return;
    }
    
    container.innerHTML = destinationJobs.map(job => {
      const pkg = job.maintenance_packages;
      const ds = pkg?.destination_services?.[0];
      const vehicle = pkg?.vehicles;
      const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
      
      return `
        <div class="package-card" style="border-left:4px solid var(--accent-blue);">
          <div class="package-header">
            <div>
              <div class="package-title">${pkg?.title || 'Destination Service'}</div>
              <div class="package-vehicle">🚗 ${vehicleName}</div>
            </div>
            <span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">
              ${ds?.service_type ? getDestinationServiceIcon(ds.service_type) + ' ' + getDestinationServiceLabel(ds.service_type) : '🎯 Destination'}
            </span>
          </div>
          ${ds ? `
            <div class="package-meta">
              <span>📍 ${ds.pickup_location || 'TBD'} → ${ds.dropoff_location || 'TBD'}</span>
            </div>
          ` : ''}
          <div class="package-footer">
            <span style="font-size:0.85rem;color:var(--text-muted);">Accepted ${formatTimeAgo(job.updated_at || job.created_at)}</span>
            <button class="btn btn-primary btn-sm" onclick="openCompleteJobModal('${job.package_id}')">✅ Complete</button>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Error loading destination tasks:', err);
  }
}

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

// ========== FLEET SERVICES ==========
let fleetBatches = [];
let fleetJobQueue = [];
let currentFleetBatch = null;

async function loadFleetBatches() {
  const container = document.getElementById('fleet-active-list');
  if (!container) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('bulk_service_batches')
      .select(`
        *,
        fleet:fleet_id(id, name, company_name),
        items:bulk_service_items(id, vehicle_id, status)
      `)
      .eq('assigned_provider_id', currentUser.id)
      .in('status', ['assigned', 'in_progress'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    fleetBatches = data || [];

    if (!fleetBatches.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚛</div><p>No active fleet jobs.</p></div>';
      return;
    }

    container.innerHTML = fleetBatches.map(batch => {
      const fleet = batch.fleet || {};
      const items = batch.items || [];
      const completedCount = items.filter(i => i.status === 'completed').length;
      const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

      return `
        <div class="fleet-batch-card" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="font-weight:600;font-size:1.05rem;">${batch.name || 'Bulk Service Batch'}</div>
              <div style="font-size:0.9rem;color:var(--text-secondary);">${fleet.company_name || fleet.name || 'Fleet'}</div>
            </div>
            <span style="background:var(--accent-blue-soft);color:var(--accent-blue);padding:4px 12px;border-radius:100px;font-size:0.8rem;">${progress}% Complete</span>
          </div>
          <div style="margin-bottom:16px;">
            <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--accent-gold),#c49a45);"></div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openFleetBatchDetail('${batch.id}')">📋 View Vehicles</button>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Error loading fleet batches:', err);
    container.innerHTML = '<div class="empty-state"><p>Failed to load fleet jobs.</p></div>';
  }
}

async function openFleetBatchDetail(batchId) {
  openModal('fleet-batch-modal');
  const body = document.getElementById('fleet-batch-modal-body');
  if (body) body.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  try {
    const { data, error } = await supabaseClient
      .from('bulk_service_batches')
      .select(`
        *,
        fleet:fleet_id(id, name, company_name),
        items:bulk_service_items(*, vehicle:vehicle_id(year, make, model))
      `)
      .eq('id', batchId)
      .single();

    if (error) throw error;
    currentFleetBatch = data;
    renderFleetBatchDetail();
  } catch (err) {
    console.error('Error loading batch:', err);
    if (body) body.innerHTML = '<div class="empty-state"><p>Failed to load batch.</p></div>';
  }
}

function renderFleetBatchDetail() {
  if (!currentFleetBatch) return;
  
  const batch = currentFleetBatch;
  const items = batch.items || [];
  const body = document.getElementById('fleet-batch-modal-body');
  
  if (!body) return;
  
  const title = document.getElementById('fleet-batch-modal-title');
  if (title) title.textContent = `📦 ${batch.name || 'Batch Details'}`;

  body.innerHTML = `
    <div style="max-height:400px;overflow-y:auto;">
      ${items.map((item, i) => {
        const v = item.vehicle || {};
        const vehicleName = v.year ? `${v.year} ${v.make} ${v.model}` : `Vehicle ${i + 1}`;
        const statusClass = item.status === 'completed' ? 'accent-green' : item.status === 'in_progress' ? 'accent-blue' : 'text-muted';
        
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:8px;">
            <div>
              <div style="font-weight:500;">${vehicleName}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="color:var(--${statusClass});text-transform:capitalize;font-size:0.85rem;">${item.status}</span>
              ${item.status !== 'completed' ? `
                <button class="btn btn-primary btn-sm" onclick="updateFleetItemStatus('${item.id}', 'completed')">✅</button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function updateFleetItemStatus(itemId, status) {
  try {
    const { error } = await supabaseClient
      .from('bulk_service_items')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) throw error;

    showToast('Status updated!', 'success');
    
    if (currentFleetBatch) {
      await openFleetBatchDetail(currentFleetBatch.id);
    }
    await loadFleetBatches();
  } catch (err) {
    console.error('Error updating item:', err);
    showToast('Failed to update', 'error');
  }
}

console.log('providers-jobs.js loaded');
