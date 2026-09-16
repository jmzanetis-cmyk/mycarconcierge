// ========== PROVIDERS JOBS MODULE ==========
// Active jobs, GPS tracking, evidence, inspections, emergency, fleet

// Local HTML-escape for user-supplied text rendered into templates.
// Used at message-thread render sites to prevent XSS via message content
// (the content arrives from the server-arbiter as plain text + redactions;
// escaping at render keeps the threat model defensive even if upstream
// sanitization is bypassed). Defined locally because providers-jobs.js is
// loaded dynamically from providers-core.js and providers.html does not
// expose a global escapeHtml helper.
function _jobsEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Task #369: Concierge driver coordination (provider side) ----
// Shared with member side via members-extras.js window.renderConciergeStatusCard.
async function providerConciergeAuthHeaderJobs() {
  try {
    const { data: { session } = {} } = await supabaseClient.auth.getSession();
    const token = session && session.access_token;
    return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : null;
  } catch { return null; }
}

// Provider concierge action handlers — wired into the per-job concierge
// section rendered inside renderActiveJobs cards. Mirrors the API contract
// in netlify/functions/concierge-jobs-public.js.
window.providerConciergeTransition = async function(jobId, packageId, toStatus, promptLabel) {
  const note = window.prompt(promptLabel || `Add a note for "${toStatus}" (optional):`, '') || '';
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { showToast('Please sign in again.', 'error'); return; }
  const resp = await fetch('/api/concierge/' + jobId + '/transition', {
    method: 'POST', headers,
    body: JSON.stringify({ to_status: toStatus, note: note.trim() || null })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    showToast('Transition failed: ' + (err.error || resp.status), 'error');
    return;
  }
  window.refreshProviderJobConcierge(packageId);
  window.refreshProviderVehicleTransfers && window.refreshProviderVehicleTransfers();
};

window.providerConciergeCancel = async function(jobId, packageId) {
  const reason = window.prompt('Why are you cancelling this driver request?', 'Coordination changed');
  if (!reason || reason.trim().length < 3) return;
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { showToast('Please sign in again.', 'error'); return; }
  const resp = await fetch('/api/concierge/' + jobId + '/cancel', {
    method: 'POST', headers, body: JSON.stringify({ reason: reason.trim() })
  });
  if (!resp.ok) { showToast('Cancel failed: ' + (await resp.text()), 'error'); return; }
  window.refreshProviderJobConcierge(packageId);
  window.refreshProviderVehicleTransfers && window.refreshProviderVehicleTransfers();
};

window.providerConciergeEditAddress = async function(jobId, packageId, currentAddress) {
  const next = window.prompt(`Update shop drop-off address (drivers haven't accepted yet):`, currentAddress || '');
  if (!next || next.trim().length < 3) return;
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { showToast('Please sign in again to edit address.', 'error'); return; }
  const resp = await fetch('/api/concierge/' + jobId + '/update-address', {
    method: 'POST', headers,
    body: JSON.stringify({ field: 'dropoff', address: next.trim() })
  });
  if (!resp.ok) { showToast('Address update failed: ' + (await resp.text()), 'error'); return; }
  window.refreshProviderJobConcierge(packageId);
};

// If appointmentId is omitted, the modal opener resolves it from the
// package on demand (same lookup the per-job refresh uses).
window.openProviderConciergeRequestModal = async function(packageId, appointmentId) {
  if (!appointmentId) {
    try {
      const { data: appt } = await supabaseClient.from('appointments')
        .select('id').eq('package_id', packageId).maybeSingle();
      if (appt && appt.id) appointmentId = appt.id;
    } catch {}
  }
  return openProviderConciergeRequestModalImpl(packageId, appointmentId || '');
};
function openProviderConciergeRequestModalImpl(packageId, appointmentId) {
  const existing = document.getElementById('prov-concierge-modal-jobs');
  if (existing) existing.remove();
  const tiers = [
    ['Tier 1 — Passenger ride', [[1,'Drop member off at shop'],[2,'Pick member up'],[3,'Round trip']]],
    ['Tier 2 — Drive vehicle', [[4,'Bring vehicle TO shop'],[5,'Return vehicle FROM shop'],[6,'Round-trip shuttle']]],
    ['Tier 3 — Paired shuttle', [[7,'Bring vehicle in (chase)'],[8,'Return vehicle (chase)']]],
    ['Tier 4 — Full concierge', [[9,'Drop-off concierge'],[10,'Pick-up concierge'],[11,'Round-trip concierge']]]
  ];
  const opts = tiers.map(([label, scen], i) =>
    `<optgroup label="${label}">${scen.map(([v, l]) => `<option value="${i+1}|${v}">${l}</option>`).join('')}</optgroup>`
  ).join('');
  const m = document.createElement('div');
  m.className = 'modal-backdrop active'; m.id = 'prov-concierge-modal-jobs';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 class="modal-title">${mccIcon('car', 18)} Request a Driver</h3>
        <button class="modal-close" onclick="document.getElementById('prov-concierge-modal-jobs').remove()">×</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <label><span style="font-size:0.85rem;color:var(--text-muted);">Service</span>
          <select id="pcjm-scenario" class="input">${opts}</select></label>
        <label><span style="font-size:0.85rem;color:var(--text-muted);">Pickup (member origin)</span>
          <input id="pcjm-pickup" class="input" type="text" /></label>
        <label><span style="font-size:0.85rem;color:var(--text-muted);">Dropoff (your shop)</span>
          <input id="pcjm-dropoff" class="input" type="text" /></label>
        <label><span style="font-size:0.85rem;color:var(--text-muted);">Notes (optional)</span>
          <textarea id="pcjm-notes" class="input" rows="3"></textarea></label>
        <div id="pcjm-error" style="color:var(--accent-red);font-size:0.85rem;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost" onclick="document.getElementById('prov-concierge-modal-jobs').remove()">Cancel</button>
          <button id="pcjm-submit" class="btn btn-primary" onclick="window.submitProviderConciergeJobRequest('${packageId}','${appointmentId}')">${mccIcon('send', 14)} Submit</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
};

window.submitProviderConciergeJobRequest = async function(packageId, appointmentId) {
  const errEl = document.getElementById('pcjm-error');
  const btn   = document.getElementById('pcjm-submit');
  errEl.textContent = '';
  const sel = document.getElementById('pcjm-scenario').value.split('|');
  const tier = Number(sel[0]); const scenario = Number(sel[1]);
  const pickup  = document.getElementById('pcjm-pickup').value.trim();
  const dropoff = document.getElementById('pcjm-dropoff').value.trim();
  const notes   = document.getElementById('pcjm-notes').value.trim();
  if (!pickup || !dropoff) { errEl.textContent = 'Pickup and dropoff are required.'; return; }
  if (!appointmentId)      { errEl.textContent = 'Provider requests need an appointment.'; return; }
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { errEl.textContent = 'Please sign in again.'; return; }
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const resp = await fetch('/api/concierge', {
      method: 'POST', headers,
      body: JSON.stringify({
        tier, scenario, appointment_id: appointmentId,
        pickup_address: pickup, dropoff_address: dropoff,
        notes: notes || null, created_by_kind: 'provider'
      })
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) { errEl.textContent = body.error || ('Request failed (' + resp.status + ')'); return; }
    document.getElementById('prov-concierge-modal-jobs').remove();
    window.refreshProviderJobConcierge(packageId);
    window.refreshProviderVehicleTransfers && window.refreshProviderVehicleTransfers();
  } catch (e) {
    errEl.textContent = 'Network error: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Submit';
  }
};

// Per-job concierge section refresh — finds jobs tied to the package's
// appointment and renders cards with per-status action buttons. Status
// shown via the shared renderConciergeStatusCard for the body, with
// action buttons appended below.
window.refreshProviderJobConcierge = async function(packageId) {
  const host = document.getElementById('concierge-job-' + packageId);
  if (!host) return;
  // Look up the appointment for this package on demand. Cached on the
  // host element so we don't re-query on every refresh tick.
  let apptId = host.getAttribute('data-appt') || '';
  if (!apptId) {
    try {
      const { data: appt } = await supabaseClient.from('appointments')
        .select('id').eq('package_id', packageId).maybeSingle();
      if (appt && appt.id) { apptId = appt.id; host.setAttribute('data-appt', apptId); }
    } catch {}
  }
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { host.textContent = 'Sign in to view driver requests.'; return; }
  try {
    const resp = await fetch('/api/concierge?role=provider', { headers });
    if (!resp.ok) { host.textContent = 'Driver requests unavailable.'; return; }
    const { jobs = [] } = await resp.json().catch(() => ({}));
    const mine = apptId ? jobs.filter(j => j.appointment_id === apptId) : [];
    if (!mine.length) {
      host.innerHTML = '<em style="color:var(--text-muted);font-size:0.85rem;">No driver requests for this job yet.</em>';
      return;
    }
    const enriched = await Promise.all(mine.map(async j => {
      try { const det = await fetch('/api/concierge/' + j.id, { headers }); if (det.ok) return (await det.json()).job; } catch {}
      return j;
    }));
    host.innerHTML = enriched.map(j => {
      const accepted = (j.assignments || []).filter(a => a.accepted_at).length;
      const card = (window.renderConciergeStatusCard || (() => ''))(j, { packageId });
      const acts = [];
      if (j.status === 'scheduled' || j.status === 'in_progress') {
        acts.push(`<button class="btn btn-secondary btn-sm" onclick="window.providerConciergeTransition('${j.id}','${packageId}','vehicle_received','Confirm vehicle received:')">${mccIcon('check', 12)} Mark Received</button>`);
      }
      if (j.status === 'vehicle_received') {
        acts.push(`<button class="btn btn-secondary btn-sm" onclick="window.providerConciergeTransition('${j.id}','${packageId}','vehicle_released','Confirm vehicle released:')">${mccIcon('package', 12)} Mark Released</button>`);
      }
      if (j.status === 'vehicle_released') {
        acts.push(`<button class="btn btn-success btn-sm" onclick="window.providerConciergeTransition('${j.id}','${packageId}','completed','Confirm completed:')">${mccIcon('check', 12)} Mark Completed</button>`);
      }
      if (['requested','scheduled','in_progress','vehicle_received','vehicle_released'].includes(j.status)) {
        acts.push(`<button class="btn btn-warning btn-sm" onclick="window.providerConciergeTransition('${j.id}','${packageId}','problem_flagged','Describe the problem:')">${mccIcon('alert-triangle', 12)} Flag Problem</button>`);
      }
      if (accepted === 0 && (j.status === 'requested' || j.status === 'scheduled')) {
        const safeAddr = JSON.stringify(j.dropoff_address || '').replaceAll('"','&quot;');
        acts.push(`<button class="btn btn-ghost btn-sm" onclick="window.providerConciergeEditAddress('${j.id}','${packageId}',${safeAddr})">${mccIcon('edit', 12)} Edit Shop Address</button>`);
      }
      if (j.status === 'requested' || j.status === 'scheduled') {
        acts.push(`<button class="btn btn-ghost btn-sm" onclick="window.providerConciergeCancel('${j.id}','${packageId}')">Cancel</button>`);
      }
      return `<div style="margin-bottom:8px;">${card}<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${acts.join('')}</div></div>`;
    }).join('');
  } catch (e) {
    host.textContent = 'Error loading driver requests: ' + e.message;
  }
};

window.refreshProviderVehicleTransfers = async function() {
  const host = document.getElementById('provider-vehicle-transfers');
  if (!host) return;
  const headers = await providerConciergeAuthHeaderJobs();
  if (!headers) { host.innerHTML = ''; return; }
  try {
    const resp = await fetch('/api/concierge?role=provider', { headers });
    if (!resp.ok) { host.innerHTML = ''; return; }
    const { jobs = [] } = await resp.json().catch(() => ({}));
    const live = jobs.filter(j => j.status !== 'cancelled' && j.status !== 'completed');
    if (!live.length) { host.innerHTML = ''; return; }
    const enriched = await Promise.all(live.slice(0, 6).map(async j => {
      try {
        const det = await fetch('/api/concierge/' + j.id, { headers });
        if (det.ok) return (await det.json()).job;
      } catch {}
      return j;
    }));
    const cards = enriched.map(j => {
      if (!j || !j.id) return '';
      const cardHtml = window.renderConciergeStatusCard
        ? window.renderConciergeStatusCard(j, { packageId: '' })
        : '';
      const jId = String(j.id).replace(/[^a-zA-Z0-9-]/g, '');
      const roadTestBtn = j.live_tracking_enabled
        ? `<button id="ptr-roadtest-btn-${jId}" class="btn btn-sm"
             style="margin-top:8px;background:var(--accent-blue,#3b82f6);color:#fff;"
             onclick="window.startProviderRoadTest('${jId}')">&#128663; Start Road Test</button>`
        : '';
      return `<div>${cardHtml}
        <div id="ptr-arrival-${jId}" style="margin-top:4px;"></div>
        ${roadTestBtn}
      </div>`;
    }).join('');
    host.innerHTML = `
      <div style="margin-bottom:18px;padding:14px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-elevated);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-weight:700;">${mccIcon('truck', 16)} Vehicle Transfers (${enriched.length})</div>
          <button class="btn btn-ghost btn-sm" onclick="window.refreshProviderVehicleTransfers()">${mccIcon('refresh-cw', 12)} Refresh</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>
      </div>
    `;
    // Start live tracking maps + inbound arrival watches after cards mount.
    setTimeout(() => {
      enriched.forEach(j => {
        if (!j || !j.id) return;
        if (window.startConciergeTracking && document.getElementById('concierge-map-' + j.id)) {
          window.startConciergeTracking(j.id);
        }
        if (j.live_tracking_enabled && window.startProviderInboundWatch) {
          window.startProviderInboundWatch(j.id);
        }
      });
    }, 250);
  } catch (e) {
    host.innerHTML = '';
    console.warn('[concierge] vehicle transfers refresh failed', e);
  }
};

// ========== ACTIVE JOBS ==========
function renderActiveJobs() {
  const container = document.getElementById('active-jobs');
  if (!container) return;

  const activeJobs = myBids.filter(b => b.status === 'accepted');
  // Cross-appointment Vehicle Transfers panel — always rendered above the
  // job list (or above the empty state) so providers can see all inbound /
  // outbound concierge jobs in one place.
  const transfersHtml = '<div id="provider-vehicle-transfers"></div>';

  if (!activeJobs.length) {
    container.innerHTML = transfersHtml + `<div class="empty-state"><div class="empty-state-icon">${mccIcon('wrench', 40)}</div><p>No active jobs. Win bids to see your jobs here!</p></div>`;
    setTimeout(() => window.refreshProviderVehicleTransfers && window.refreshProviderVehicleTransfers(), 200);
    return;
  }
  
  container.innerHTML = transfersHtml + activeJobs.map(job => {
    const pkg = job.maintenance_packages;
    const vehicle = pkg?.vehicles;
    const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
    const isTracking = activeTrackingPackageId === job.package_id;

    // CR5: removed the `pending_split_payment` branch + the `crowd_funded` badge.
    // Both were maintenance_packages-only concepts. care_plans models payment
    // via care_plans.payment_status (none/requires_payment/held/captured/...)
    // and has no crowd_funded column. Re-introducing either should be done
    // deliberately as a separate feature on care_plans, not silently grafted in.

    return `
      <div class="package-card" style="border-left:4px solid var(--accent-green);">
        <div class="package-header">
          <div>
            <div class="package-title">${pkg?.title || 'Job'}</div>
            <div class="package-vehicle">${mccIcon('car', 16)} ${vehicleName}</div>
          </div>
          <span class="package-badge" style="background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
        </div>
        <div class="package-meta">
          <span>${mccIcon('dollar-sign', 16)} Your bid: <strong>$${job.price}</strong></span>
          <span>${mccIcon('calendar', 16)} Accepted ${formatTimeAgo(job.updated_at || job.created_at)}</span>
        </div>
        </div>
        <div id="provider-mediation-${job.package_id}" style="display:none;margin-bottom:8px;"></div>
        <div class="package-footer">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="openMessageModal('${pkg?.member_id}', '${job.package_id}')">${mccIcon('message-square', 16)} Message</button>
            ${isTracking 
              ? `<button class="btn btn-sm" style="background:var(--accent-red);color:#fff;" onclick="stopGpsTracking()">${mccIcon('circle-alert', 16)} Stop Tracking</button>`
              : `<button class="btn btn-sm" style="background:var(--accent-blue);color:#fff;" onclick="startGpsTracking('${job.package_id}')">${mccIcon('map-pin', 16)} Start GPS</button>`
            }
            <button class="btn btn-primary btn-sm" onclick="openCompleteJobModal('${job.package_id}')">${mccIcon('check-circle', 16)} Complete</button>
            <div class="dropdown" style="position:relative;">
              <button class="btn btn-secondary btn-sm" onclick="toggleJobActionsMenu('${job.package_id}')">⋮ More</button>
              <div class="dropdown-menu" id="job-actions-menu-${job.package_id}" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:50;min-width:180px;">
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="openAdditionalWorkModal('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('wrench', 16)} Request Additional Work</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="openDiscountModal('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('dollar-sign', 16)} Offer Discount</button>
                <hr style="margin:4px 0;border:none;border-top:1px solid var(--border-subtle);">
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="viewAdditionalWorkRequests('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('clipboard-list', 16)} View Additional Work</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="viewDiscountsOffered('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('gift', 16)} View Discounts</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:0.9rem;" onclick="fetchAndShowCalendarOptions('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('calendar', 16)} Add to Calendar</button>
                <button class="dropdown-item" style="display:block;width:100%;padding:10px 16px;text-align:left;background:none;border:none;cursor:pointer;color:var(--accent-blue);font-size:0.9rem;" onclick="providerGenerateDebrief('${job.package_id}');toggleJobActionsMenu('${job.package_id}')">${mccIcon('file-text', 16)} AI Service Summary</button>
              </div>
            </div>
          </div>
        </div>
        <div id="provider-debrief-panel-${job.package_id}" style="display:none;margin-top:12px;"></div>
        <!-- Task #369: per-job concierge coordination panel -->
        <div style="margin-top:12px;padding:12px;border-top:1px dashed var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:600;">${mccIcon('car', 14)} MCC Driver Concierge</div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="window.openProviderConciergeRequestModal('${job.package_id}','')">${mccIcon('plus', 12)} Request Driver</button>
              <button class="btn btn-ghost btn-sm" onclick="window.refreshProviderJobConcierge('${job.package_id}')">${mccIcon('refresh-cw', 12)}</button>
            </div>
          </div>
          <div id="concierge-job-${job.package_id}" style="font-size:0.9rem;color:var(--text-secondary);">Checking…</div>
        </div>
      </div>
    `;
  }).join('');

  setTimeout(() => loadProviderMediations(), 300);
  setTimeout(() => window.refreshProviderVehicleTransfers && window.refreshProviderVehicleTransfers(), 200);
  // Hydrate per-job concierge sections after cards mount.
  setTimeout(() => {
    activeJobs.forEach(j => window.refreshProviderJobConcierge && window.refreshProviderJobConcierge(j.package_id));
  }, 250);
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
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    await fetch(`${apiBase}/api/tracking/update`, {
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
          <p style="margin:0;">${_jobsEscapeHtml(m.content)}</p>
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
    // Server arbiter (see members-extras.js sendMessage for rationale).
    // The endpoint also denormalizes provider_alias server-side, so we no
    // longer need to send it from the client.
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { showToast('Please sign in to send', 'error'); return; }
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        package_id: currentMessagePackageId,
        recipient_id: currentMessageMemberId,
        content,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.error === 'no_active_relationship'
        ? 'You can only message this member on a job your bid has been accepted on.'
        : 'Failed to send message', 'error');
      return;
    }

    textarea.value = '';
    await loadConversation(currentMessageMemberId, currentMessagePackageId);
    if (data.warning) showToast(data.warning, 'info');
    else              showToast('Message sent!', 'success');
  } catch (err) {
    console.error('Send message error:', err);
    showToast('Failed to send message', 'error');
  }
}

// ========== COMPLETE JOB ==========
function openCompleteJobModal(packageId) {
  const job = myBids.find(b => b.package_id === packageId);
  if (job?.maintenance_packages?.status === 'pending_split_payment') {
    showToast(I18n.t('provider.splitPayment.cannotComplete'), 'error');
    return;
  }
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
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/jobs/complete`, {
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

    const result = await response.json().catch(() => ({}));
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
  const estimatedCost = Number.parseFloat(document.getElementById('additional-work-cost')?.value) || 0;
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
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/additional-work/request`, {
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

    const result = await response.json().catch(() => ({}));
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
  const discountAmount = Number.parseFloat(document.getElementById('discount-amount')?.value) || 0;
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
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/discount/offer`, {
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

    const result = await response.json().catch(() => ({}));
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

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Failed to load requests');
    
    const requests = result.requests || result || [];
    
    if (!requests.length) {
      container.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">${mccIcon('clipboard-list', 40)}</div><p>No additional work requests for this job</p></div>`;
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
            <span style="font-weight:600;">$${Number.parseFloat(req.estimated_cost || 0).toFixed(2)}</span>
            <span style="padding:4px 12px;border-radius:100px;font-size:0.8rem;background:${status.bg};color:${status.color};">${status.label}</span>
          </div>
          <p style="margin:0 0 8px 0;color:var(--text-secondary);font-size:0.9rem;">${req.description || 'No description'}</p>
          <span style="font-size:0.8rem;color:var(--text-muted);">Requested ${formatTimeAgo(req.created_at)}</span>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Load additional work requests error:', err);
    container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">' + mccIcon('alert-triangle', 40) + '</div><p>Failed to load requests</p></div>';
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

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Failed to load discounts');
    
    const discounts = result.discounts || result || [];
    
    if (!discounts.length) {
      container.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">${mccIcon('dollar-sign', 40)}</div><p>No discounts offered for this job</p></div>`;
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
        : `$${Number.parseFloat(disc.discount_amount || 0).toFixed(2)}`;
      
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
    container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">' + mccIcon('alert-triangle', 40) + '</div><p>Failed to load discounts</p></div>';
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
    if (queueEl) queueEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">' + mccIcon('map-pin', 16) + ' Enable location to see nearby emergencies</p></div>';
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
    if (queueEl) queueEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('alert-triangle', 40)}</div><p>Failed to load emergencies</p></div>`;
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
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('check-circle', 40) + '</div><p>No pending emergencies nearby</p></div>';
    return;
  }
  
  const typeLabels = {
    'flat_tire': mccIcon('settings', 16) + ' Flat Tire',
    'dead_battery': mccIcon('zap', 16) + ' Dead Battery',
    'lockout': mccIcon('lock', 16) + ' Locked Out',
    'tow_needed': mccIcon('truck', 16) + ' Tow Needed',
    'fuel_delivery': mccIcon('fuel', 16) + ' Out of Fuel',
    'accident': mccIcon('circle-alert', 16) + ' Accident',
    'other': mccIcon('circle-help', 16) + ' Other'
  };
  
  const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
  const hasCredits = totalCredits >= 1;
  
  container.innerHTML = nearbyEmergencies.map(e => {
    const timeAgo = formatTimeAgo(e.created_at);
    const distance = e.distance_miles ? `${e.distance_miles.toFixed(1)} mi away` : 'Nearby';
    const escrowAmount = e.escrow_amount ? `$${Number.parseFloat(e.escrow_amount).toFixed(2)}` : 'Pending';
    
    return `
      <div class="emergency-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <span class="emergency-type-badge">${typeLabels[e.emergency_type] || e.emergency_type}</span>
            <div style="margin-top:8px;">
              <span class="emergency-distance">${mccIcon('map-pin', 16)} ${distance}</span>
              <span class="emergency-time" style="margin-left:12px;">${mccIcon('clock', 16)} ${timeAgo}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem;font-weight:600;color:var(--accent-green);margin-top:4px;">${mccIcon('dollar-sign', 20)} ${escrowAmount}</div>
          </div>
        </div>
        ${e.address ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">${e.address}</div>` : ''}
        <div class="emergency-actions">
          <button class="btn btn-emergency" onclick="openAcceptEmergency('${e.id}')" ${!hasCredits ? 'disabled style="opacity:0.5;"' : ''}>${mccIcon('car', 16)} Claim Emergency</button>
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
    'flat_tire': mccIcon('settings', 16) + ' Flat Tire',
    'dead_battery': mccIcon('zap', 16) + ' Dead Battery',
    'lockout': mccIcon('lock', 16) + ' Locked Out',
    'tow_needed': mccIcon('truck', 16) + ' Tow Needed',
    'fuel_delivery': mccIcon('fuel', 16) + ' Out of Fuel',
    'accident': mccIcon('circle-alert', 16) + ' Accident',
    'other': mccIcon('circle-help', 16) + ' Other'
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
        <div style="font-size:0.9rem;color:var(--text-secondary);">${mccIcon('car', 16)} ${vehicleName}</div>
        ${memberPhone ? `<div style="font-size:0.9rem;color:var(--text-secondary);">${mccIcon('phone', 16)} ${memberPhone}</div>` : ''}
        ${e.address ? `<div style="font-size:0.9rem;color:var(--text-secondary);">${mccIcon('map-pin', 16)} ${e.address}</div>` : ''}
      </div>
      <div class="emergency-actions">
        <button class="btn btn-primary" onclick="updateMyEmergencyStatus('${e.id}', 'completed')">${mccIcon('check-circle', 16)} Mark Complete</button>
        ${memberPhone ? `<a href="tel:${memberPhone}" class="btn btn-secondary">${mccIcon('phone', 16)} Call</a>` : ''}
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
    'flat_tire': mccIcon('settings', 16) + ' Flat Tire',
    'dead_battery': mccIcon('zap', 16) + ' Dead Battery',
    'lockout': mccIcon('lock', 16) + ' Locked Out',
    'tow_needed': mccIcon('truck', 16) + ' Tow Needed',
    'fuel_delivery': mccIcon('fuel', 16) + ' Out of Fuel',
    'accident': mccIcon('circle-alert', 16) + ' Accident',
    'other': mccIcon('circle-help', 16) + ' Other'
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
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('send', 40) + '</div><p>No destination service jobs yet.</p></div>';
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
              <div class="package-vehicle">${mccIcon('car', 16)} ${vehicleName}</div>
            </div>
            <span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">
              ${ds?.service_type ? getDestinationServiceIcon(ds.service_type) + ' ' + getDestinationServiceLabel(ds.service_type) : mccIcon('target', 16) + ' Destination'}
            </span>
          </div>
          ${ds ? `
            <div class="package-meta">
              <span>${mccIcon('map-pin', 16)} ${ds.pickup_location || 'TBD'} → ${ds.dropoff_location || 'TBD'}</span>
            </div>
          ` : ''}
          ${pkg?.status === 'pending_split_payment' ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius-md);padding:12px;margin:8px 0;color:#92400e;font-size:0.9rem;">
            ${mccIcon('alert-triangle', 16)} ${I18n.t('provider.splitPayment.pendingBanner')}
          </div>
          ` : ''}
          <div class="package-footer">
            <span style="font-size:0.85rem;color:var(--text-muted);">Accepted ${formatTimeAgo(job.updated_at || job.created_at)}</span>
            ${pkg?.status === 'pending_split_payment' ? '' : `<button class="btn btn-primary btn-sm" onclick="openCompleteJobModal('${job.package_id}')">${mccIcon('check-circle', 16)} Complete</button>`}
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

// ========== FLEET SERVICES ==========
if (typeof fleetBatches === 'undefined') {
  var fleetBatches = [];
}
if (typeof fleetJobQueue === 'undefined') {
  var fleetJobQueue = [];
}
if (typeof currentFleetBatch === 'undefined') {
  var currentFleetBatch = null;
}

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
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('truck', 40) + '</div><p>No active fleet jobs.</p></div>';
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
          <button class="btn btn-primary btn-sm" onclick="openFleetBatchDetail('${batch.id}')">${mccIcon('clipboard-list', 16)} View Vehicles</button>
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
  if (title) title.innerHTML = `${mccIcon('package', 16)} ${batch.name || 'Batch Details'}`;

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
                <button class="btn btn-primary btn-sm" onclick="updateFleetItemStatus('${item.id}', 'completed')">${mccIcon('check-circle', 16)}</button>
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

// ========== QR SCANNER FOR MEMBER CHECK-IN ==========
let html5QrCode = null;
let qrScannerActive = false;

function openQrScannerModal() {
  openModal('qr-scanner-modal');
  setTimeout(() => startQrScanner(), 300);
}

function closeQrScannerModal() {
  stopQrScanner();
  closeModal('qr-scanner-modal');
  const statusEl = document.getElementById('qr-scanner-status');
  if (statusEl) {
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';
  }
}

async function startQrScanner() {
  const readerEl = document.getElementById('qr-reader');
  const cameraSelectGroup = document.getElementById('qr-camera-select-group');
  const cameraSelect = document.getElementById('qr-camera-select');
  
  if (!readerEl) return;
  
  if (typeof Html5Qrcode === 'undefined') {
    showQrScannerStatus('QR scanner library not loaded. Please refresh the page.', 'error');
    return;
  }
  
  try {
    const devices = await Html5Qrcode.getCameras();
    
    if (!devices || devices.length === 0) {
      showQrScannerStatus('No cameras found. Please allow camera access.', 'error');
      return;
    }
    
    if (devices.length > 1 && cameraSelect && cameraSelectGroup) {
      cameraSelectGroup.style.display = 'block';
      cameraSelect.innerHTML = devices.map((d, i) => 
        `<option value="${d.id}">${d.label || `Camera ${i + 1}`}</option>`
      ).join('');
    }
    
    html5QrCode = new Html5Qrcode("qr-reader");
    qrScannerActive = true;
    
    const preferredCamera = devices.find(d => d.label?.toLowerCase().includes('back')) || devices[0];
    
    await html5QrCode.start(
      preferredCamera.id,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onQrCodeScanned,
      () => {}
    );
    
    if (cameraSelect) cameraSelect.value = preferredCamera.id;
    
  } catch (err) {
    console.error('QR Scanner start error:', err);
    showQrScannerStatus('Failed to start camera. Please check permissions.', 'error');
  }
}

async function stopQrScanner() {
  if (html5QrCode && qrScannerActive) {
    try {
      await html5QrCode.stop();
    } catch (err) {
      console.log('QR Scanner stop:', err);
    }
    qrScannerActive = false;
  }
}

async function switchQrCamera() {
  const cameraSelect = document.getElementById('qr-camera-select');
  if (!cameraSelect || !html5QrCode) return;
  
  const newCameraId = cameraSelect.value;
  
  try {
    if (qrScannerActive) {
      await html5QrCode.stop();
    }
    
    await html5QrCode.start(
      newCameraId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onQrCodeScanned,
      () => {}
    );
    qrScannerActive = true;
  } catch (err) {
    console.error('Camera switch error:', err);
    showQrScannerStatus('Failed to switch camera.', 'error');
  }
}

async function onQrCodeScanned(decodedText) {
  if (!qrScannerActive) return;
  
  await stopQrScanner();
  
  showQrScannerStatus('Processing QR code...', 'info');
  
  const parsedData = parseCheckInQrCode(decodedText);
  
  if (!parsedData) {
    showQrScannerStatus('Invalid QR code format. Please scan a valid member check-in code.', 'error');
    setTimeout(() => startQrScanner(), 2000);
    return;
  }
  
  await confirmMemberArrival(parsedData.packageId, parsedData.token);
}

function parseCheckInQrCode(url) {
  try {
    if (url.includes('/check-in.html')) {
      const urlObj = new URL(url, window.location.origin);
      const packageId = urlObj.searchParams.get('package');
      const token = urlObj.searchParams.get('token');
      if (packageId && token) return { packageId, token };
    }
    
    const directMatch = url.match(/\/checkin\/([^\/]+)\/([^\/\?]+)/);
    if (directMatch) {
      return { packageId: directMatch[1], token: directMatch[2] };
    }
    
    const simpleMatch = url.match(/package=([^&]+).*token=([^&]+)/);
    if (simpleMatch) {
      return { packageId: simpleMatch[1], token: simpleMatch[2] };
    }
    
    return null;
  } catch (err) {
    console.error('QR parse error:', err);
    return null;
  }
}

async function confirmMemberArrival(packageId, token) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    const response = await fetch(`/api/package/${packageId}/confirm-arrival`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ token })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Failed to confirm arrival');
    }
    
    closeQrScannerModal();
    
    const memberName = result.member?.full_name || result.member_name || 'Member';
    const vehicleInfo = result.vehicle 
      ? `${result.vehicle.year || ''} ${result.vehicle.make || ''} ${result.vehicle.model || ''}`.trim() 
      : result.vehicle_info || '';
    
    let successMsg = `${mccIcon('check-circle', 16)} Check-in confirmed for ${memberName}`;
    if (vehicleInfo) successMsg += ` - ${vehicleInfo}`;
    
    showToast(successMsg, 'success');
    
    if (typeof loadMyBids === 'function') {
      await loadMyBids();
    }
    if (typeof renderActiveJobs === 'function') {
      renderActiveJobs();
    }
    
  } catch (err) {
    console.error('Confirm arrival error:', err);
    showQrScannerStatus(err.message || 'Failed to confirm arrival. Please try again.', 'error');
    setTimeout(() => startQrScanner(), 3000);
  }
}

function showQrScannerStatus(message, type) {
  const statusEl = document.getElementById('qr-scanner-status');
  if (!statusEl) return;
  
  const styles = {
    error: 'background:var(--accent-red-soft);color:var(--accent-red);border:1px solid rgba(248,113,113,0.3);',
    success: 'background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(52,211,153,0.3);',
    info: 'background:var(--accent-blue-soft);color:var(--accent-blue);border:1px solid rgba(56,189,248,0.3);'
  };
  
  statusEl.style.cssText = `display:block;padding:12px;border-radius:var(--radius-md);${styles[type] || styles.info}`;
  statusEl.innerHTML = message;
}

// ========== PROVIDER REFUND MANAGEMENT ==========

async function loadProviderRefundBadge() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/provider/refunds`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const refunds = data.refunds || data || [];
    const pendingCount = Array.isArray(refunds) ? refunds.filter(r => r.status === 'pending').length : 0;
    const badge = document.getElementById('refund-count');
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading refund badge:', err);
  }
}

async function loadProviderRefunds() {
  const container = document.getElementById('refund-requests');
  if (!container) return;

  container.innerHTML = '<div class="page-header"><h1 class="page-title">Refund Requests</h1><p class="page-subtitle">Manage member refund requests for your services.</p></div><div style="text-align:center;padding:40px;"><div class="empty-state-icon" style="font-size:2rem;">' + mccIcon('clock', 40) + '</div><p style="color:var(--text-secondary);">Loading refund requests...</p></div>';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      container.innerHTML = '<div class="page-header"><h1 class="page-title">Refund Requests</h1></div><div class="empty-state"><div class="empty-state-icon">' + mccIcon('lock', 40) + '</div><p>Please log in to view refund requests.</p></div>';
      return;
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/provider/refunds`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to load refunds: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    const refunds = data.refunds || data || [];

    if (!Array.isArray(refunds) || refunds.length === 0) {
      container.innerHTML = '<div class="page-header"><h1 class="page-title">Refund Requests</h1><p class="page-subtitle">Manage member refund requests for your services.</p></div><div class="empty-state"><div class="empty-state-icon">' + mccIcon('dollar-sign', 40) + '</div><p>No refund requests yet. You\'re all clear!</p></div>';
      return;
    }

    const pendingRefunds = refunds.filter(r => r.status === 'pending');
    const processedRefunds = refunds.filter(r => r.status !== 'pending');

    let html = '<div class="page-header"><h1 class="page-title">Refund Requests</h1><p class="page-subtitle">Manage member refund requests for your services.</p></div>';

    html += '<div class="stats-grid" style="margin-bottom:24px;">';
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-orange);">${pendingRefunds.length}</div><div class="stat-label">Pending</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-green);">${processedRefunds.filter(r => r.status === 'approved').length}</div><div class="stat-label">Approved</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-red);">${processedRefunds.filter(r => r.status === 'denied').length}</div><div class="stat-label">Denied</div></div>`;
    html += `<div class="stat-card"><div class="stat-value">${refunds.length}</div><div class="stat-label">Total</div></div>`;
    html += '</div>';

    if (pendingRefunds.length > 0) {
      html += '<div class="card" style="margin-bottom:20px;"><div class="card-header"><h2 class="card-title" style="color:var(--accent-orange);">' + mccIcon('clock', 16) + ' Pending Requests</h2></div>';
      html += pendingRefunds.map(r => renderRefundCard(r, true)).join('');
      html += '</div>';
    }

    if (processedRefunds.length > 0) {
      html += '<div class="card"><div class="card-header"><h2 class="card-title">' + mccIcon('clipboard-list', 16) + ' Processed Requests</h2></div>';
      html += processedRefunds.map(r => renderRefundCard(r, false)).join('');
      html += '</div>';
    }

    container.innerHTML = html;

    loadProviderRefundBadge();

  } catch (err) {
    console.error('Error loading provider refunds:', err);
    container.innerHTML = '<div class="page-header"><h1 class="page-title">Refund Requests</h1></div><div class="empty-state"><div class="empty-state-icon">' + mccIcon('alert-triangle', 40) + '</div><p>Unable to load refund requests. Please try again later.</p></div>';
  }
}

function renderRefundCard(refund, showActions) {
  const amount = refund.amount_cents ? `$${(refund.amount_cents / 100).toFixed(2)}` : (refund.amount ? `$${Number.parseFloat(refund.amount).toFixed(2)}` : '$0.00');
  const memberName = refund.member_name || refund.member?.full_name || refund.member?.email || 'Member';
  const packageTitle = refund.package_title || refund.package?.title || 'Service Package';
  const refundType = refund.refund_type || refund.type || 'full';
  const reason = refund.reason || 'No reason provided';
  const status = refund.status || 'pending';
  const requestedDate = refund.created_at ? new Date(refund.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';

  const statusStyles = {
    pending: 'background:var(--accent-orange-soft);color:var(--accent-orange);',
    approved: 'background:var(--accent-green-soft);color:var(--accent-green);',
    denied: 'background:var(--accent-red-soft);color:var(--accent-red);',
    cancelled: 'background:rgba(107,114,128,0.15);color:var(--text-muted);',
    processed: 'background:var(--accent-green-soft);color:var(--accent-green);'
  };

  const statusLabels = {
    pending: mccIcon('clock', 16) + ' Pending',
    approved: mccIcon('check-circle', 16) + ' Approved',
    denied: mccIcon('x', 16) + ' Denied',
    cancelled: mccIcon('x', 16) + ' Cancelled',
    processed: mccIcon('check-circle', 16) + ' Processed'
  };

  let html = `<div style="padding:16px;border-bottom:1px solid var(--border-subtle);">`;
  html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">`;
  html += `<div><div style="font-weight:600;color:var(--text-primary);font-size:1rem;">${packageTitle}</div>`;
  html += `<div style="color:var(--text-secondary);font-size:0.85rem;margin-top:2px;">${mccIcon('user', 16)} ${memberName}</div></div>`;
  html += `<div style="display:flex;align-items:center;gap:8px;">`;
  html += `<span style="font-weight:700;font-size:1.1rem;color:var(--accent-gold);">${amount}</span>`;
  html += `<span class="package-badge" style="${statusStyles[status] || statusStyles.pending}padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;">${statusLabels[status] || status}</span>`;
  html += `</div></div>`;

  html += `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.85rem;color:var(--text-secondary);margin-bottom:10px;">`;
  html += `<span>${mccIcon('clipboard-list', 16)} Type: <strong style="color:var(--text-primary);text-transform:capitalize;">${refundType}</strong></span>`;
  if (refund.split_payment) html += `<span style="background:rgba(56,189,248,0.12);color:var(--accent-blue);padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${mccIcon('users', 16)} Split Payment</span>`;
  html += `<span>${mccIcon('calendar', 16)} Requested: <strong style="color:var(--text-primary);">${requestedDate}</strong></span>`;
  html += `</div>`;

  if (reason) {
    html += `<div style="background:var(--bg-input);padding:10px 14px;border-radius:var(--radius-sm);font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">`;
    html += `<strong style="color:var(--text-primary);">Reason:</strong> ${reason}`;
    html += `</div>`;
  }

  if (showActions) {
    const amountCents = refund.amount_cents || Math.round(Number.parseFloat(refund.amount || 0) * 100);
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;">`;
    html += `<button class="btn btn-sm" style="background:var(--accent-green);color:#fff;border:none;padding:8px 16px;border-radius:var(--radius-sm);cursor:pointer;font-weight:600;font-size:0.85rem;" onclick="approveProviderRefund('${refund.id}', ${amountCents})">${mccIcon('check-circle', 16)} Approve Refund</button>`;
    html += `<button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;padding:8px 16px;border-radius:var(--radius-sm);cursor:pointer;font-weight:600;font-size:0.85rem;" onclick="denyProviderRefund('${refund.id}')">${mccIcon('x', 16)} Deny Refund</button>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

async function approveProviderRefund(refundId, amountCents) {
  const amountStr = amountCents ? `$${(amountCents / 100).toFixed(2)}` : 'this refund';
  if (!confirm(`Are you sure you want to approve the refund of ${amountStr}? The member will be refunded.`)) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast('Please log in to process refunds.', 'error');
      return;
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/provider/refunds/${refundId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'approve' })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to approve refund (${res.status})`);
    }

    showToast('Refund approved successfully!', 'success');
    loadProviderRefunds();
  } catch (err) {
    console.error('Error approving refund:', err);
    showToast(err.message || 'Failed to approve refund. Please try again.', 'error');
  }
}

async function denyProviderRefund(refundId) {
  if (!confirm('Are you sure you want to deny this refund request?')) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast('Please log in to process refunds.', 'error');
      return;
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/provider/refunds/${refundId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'deny' })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to deny refund (${res.status})`);
    }

    showToast('Refund request denied.', 'success');
    loadProviderRefunds();
  } catch (err) {
    console.error('Error denying refund:', err);
    showToast(err.message || 'Failed to deny refund. Please try again.', 'error');
  }
}

async function fetchAndShowCalendarOptions(packageId) {
  try {
    const { data: appt, error } = await supabaseClient
      .from('service_appointments')
      .select('id, scheduled_date, scheduled_time, confirmed_date, confirmed_time_start, status, notes')
      .eq('package_id', packageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !appt) {
      const pkg = myBids.find(b => b.package_id === packageId)?.maintenance_packages;
      const fallbackDate = new Date().toISOString().split('T')[0];
      showProviderApptCalendarOptions(null, fallbackDate, '', pkg?.title || 'Auto Service');
      return;
    }

    const dateStr = appt.confirmed_date || appt.scheduled_date || new Date().toISOString().split('T')[0];
    const timeStr = appt.confirmed_time_start || appt.scheduled_time || '09:00';
    const pkg = myBids.find(b => b.package_id === packageId)?.maintenance_packages;
    showProviderApptCalendarOptions(appt.id, dateStr, timeStr, pkg?.title || 'Auto Service');
  } catch (err) {
    console.log('Calendar fetch error:', err);
    showProviderApptCalendarOptions(null, new Date().toISOString().split('T')[0], '', 'Auto Service');
  }
}

function showProviderApptCalendarOptions(apptId, dateStr, timeStr, serviceTitle) {
  const title = (serviceTitle || 'Auto Service') + ' — My Car Concierge';
  const desc = 'Service appointment booked via My Car Concierge';

  function toISODate(ds) {
    try { const d = new Date(ds); return d.toISOString().split('T')[0].replace(/-/g, ''); } catch(e) { return ''; }
  }
  function to24h(t) {
    if (!t) return '090000';
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!m) return '090000';
    let h = Number.parseInt(m[1]); const min = m[2];
    if (m[3] && m[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (m[3] && m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + min + '00';
  }
  const dtDate = toISODate(dateStr);
  const startH = to24h(timeStr);
  const endHour = String(Math.min(Number.parseInt(startH.substring(0, 2)) + 1, 23)).padStart(2, '0');
  const dtStart = dtDate + 'T' + startH;
  const dtEnd = dtDate + 'T' + endHour + startH.substring(2);

  const downloadIcsFn = apptId
    ? `(async function(){
        try {
          var sess = await supabaseClient.auth.getSession();
          var token = sess.data.session.access_token;
          var resp = await fetch('/api/appointments/' + '${apptId}' + '/ical', {headers:{'Authorization':'Bearer '+token}});
          if(resp.ok){var blob=await resp.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mcc-appointment.ics';a.click();}
          else{showToast('Could not download calendar file','error');}
        }catch(e){showToast('Calendar download failed','error');}
        document.getElementById('provider-cal-modal').remove();
      })()`
    : `(function(){
        var ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MCC//EN','BEGIN:VEVENT','UID:mcc-'+Date.now()+'@mycarconcierge.com','DTSTART:${dtStart}','DTEND:${dtEnd}','SUMMARY:${title.replace(/'/g, '')}','DESCRIPTION:${desc}','END:VEVENT','END:VCALENDAR'].join('\\r\\n');
        var blob=new Blob([ics],{type:'text/calendar'});
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mcc-appointment.ics';a.click();
        document.getElementById('provider-cal-modal').remove();
      })()`;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop active';
  modal.id = 'provider-cal-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:340px;">
      <div class="modal-header"><h3 class="modal-title">Add to Calendar</h3><button class="modal-close" onclick="document.getElementById('provider-cal-modal').remove()">×</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;">
        <button class="btn btn-primary" onclick="${downloadIcsFn.replace(/"/g, '&quot;')}">Download .ics File</button>
        <a class="btn btn-ghost" href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(desc)}" target="_blank" rel="noopener" onclick="document.getElementById('provider-cal-modal').remove()">Open in Google Calendar</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function escapeAITextLocal(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadProviderMediations() {
  const activeJobs = (typeof myBids !== 'undefined' ? myBids : []).filter(b => b.status === 'accepted');
  if (!activeJobs.length) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    for (const job of activeJobs) {
      const container = document.getElementById(`provider-mediation-${job.package_id}`);
      if (!container) continue;

      try {
        const resp = await fetch(`${apiBase}/api/packages/${job.package_id}/ai-mediation`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!resp.ok) continue;

        const data = await resp.json().catch(() => ({}));
        if (!data.mediation) continue;

        const m = data.mediation;
        const discList = (m.discrepancies && m.discrepancies.length > 0)
          ? m.discrepancies.map(d => `<li>${escapeAITextLocal(d)}</li>`).join('')
          : '<li style="color:var(--text-muted);">None noted</li>';

        container.style.display = 'block';
        container.innerHTML = `
          <div style="border:1px solid rgba(56,189,248,0.25);border-radius:var(--radius-md);padding:14px;background:rgba(56,189,248,0.05);margin-top:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-weight:600;font-size:0.88rem;">${mccIcon('gavel', 14)} AI Mediation Assessment</span>
              <span style="font-size:0.65rem;padding:2px 6px;background:rgba(56,189,248,0.15);border-radius:100px;color:var(--accent-blue);">AI</span>
              <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">${m.confidence ? m.confidence.toUpperCase() + ' confidence' : ''}</span>
            </div>
            <p style="font-size:0.88rem;margin:0 0 8px;line-height:1.5;">${escapeAITextLocal(m.summary)}</p>
            <div style="font-size:0.82rem;margin-bottom:8px;">
              <span style="font-weight:500;color:var(--text-secondary);">Discrepancies:</span>
              <ul style="margin:4px 0 0;padding-left:18px;">${discList}</ul>
            </div>
            <div style="padding:10px;background:rgba(56,189,248,0.08);border-radius:var(--radius-sm);font-size:0.88rem;">
              <span style="font-weight:500;color:var(--accent-blue);">Recommendation:</span> ${escapeAITextLocal(m.recommendation)}
            </div>
            <p style="font-size:0.75rem;color:var(--text-muted);margin:8px 0 0;">This assessment is advisory only and does not affect payment automatically.</p>
          </div>
        `;
      } catch (e) {}
    }
  } catch (e) {}
}

window.loadProviderMediations = loadProviderMediations;

async function providerGenerateDebrief(packageId) {
  const panel = document.getElementById(`provider-debrief-panel-${packageId}`);
  if (!panel) return;

  const job = myBids.find(b => b.package_id === packageId);
  if (!job) return;

  panel.style.display = 'block';
  panel.innerHTML = `<div style="padding:12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
    <div style="display:flex;align-items:center;gap:8px;color:var(--accent-blue);font-size:0.9rem;">
      ${mccIcon('loader', 16)} Generating AI service summary...
    </div>
  </div>`;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(`${apiBase}/api/ai/appointment-debrief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ package_id: packageId })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to generate summary');

    const summaryText = data.summary || '';
    panel.innerHTML = `
      <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;font-size:0.88rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-weight:600;color:var(--accent-blue);display:flex;align-items:center;gap:6px;">${mccIcon('file-text', 16)} AI Service Summary</span>
          <button onclick="document.getElementById('provider-debrief-panel-${packageId}').style.display='none'" style="background:none;border:none;cursor:pointer;color:var(--text-muted);">${mccIcon('x', 14)}</button>
        </div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">Review and edit the AI-generated summary before saving to the member's service record.</p>
        <textarea id="debrief-edit-${packageId}" style="width:100%;min-height:120px;padding:10px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary);font-size:0.88rem;line-height:1.5;resize:vertical;font-family:inherit;" placeholder="Service summary...">${escapeAITextLocal(summaryText)}</textarea>
        <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
          <button onclick="document.getElementById('provider-debrief-panel-${packageId}').style.display='none'" class="btn btn-secondary btn-sm">Cancel</button>
          <button onclick="saveProviderDebrief('${packageId}')" class="btn btn-primary btn-sm" id="debrief-save-btn-${packageId}">${mccIcon('save', 14)} Save to Service Record</button>
        </div>
        <p style="font-size:0.72rem;color:var(--text-muted);margin:8px 0 0;">Saving will update the member's service history and completion notes.</p>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--accent-red);font-size:0.85rem;">${mccIcon('alert-triangle', 14)} ${err.message || 'Could not generate summary'}</div>`;
  }
}
window.providerGenerateDebrief = providerGenerateDebrief;

async function saveProviderDebrief(packageId) {
  const textarea = document.getElementById(`debrief-edit-${packageId}`);
  const saveBtn = document.getElementById(`debrief-save-btn-${packageId}`);
  if (!textarea) return;

  const summaryText = textarea.value.trim();
  if (!summaryText) {
    showToast('Please enter a summary before saving', 'error');
    return;
  }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(`${apiBase}/api/ai/save-debrief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ package_id: packageId, summary: summaryText })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to save summary');

    const panel = document.getElementById(`provider-debrief-panel-${packageId}`);
    if (panel) {
      panel.innerHTML = `
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;font-size:0.88rem;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--accent-green);">${mccIcon('check-circle', 16)} Summary saved to service record</div>
          <p style="margin:0;line-height:1.5;color:var(--text-secondary);">${escapeAITextLocal(summaryText)}</p>
        </div>
      `;
    }
    showToast('Service summary saved successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Could not save summary', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = `${mccIcon('save', 14)} Save to Service Record`; }
  }
}
window.saveProviderDebrief = saveProviderDebrief;

console.log('providers-jobs.js loaded');
