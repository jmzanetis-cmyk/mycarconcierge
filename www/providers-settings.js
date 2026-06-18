// ========== PROVIDERS SETTINGS MODULE ==========
// Profile, team management, verification, notifications, referrals

// XSS-safe HTML escape helper
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ========== PROFILE MANAGEMENT ==========
async function saveProviderProfile() {
  const fields = {
    business_name: document.getElementById('profile-business-name')?.value,
    phone: document.getElementById('profile-phone')?.value,
    address: document.getElementById('profile-address')?.value,
    city: document.getElementById('profile-city')?.value,
    state: document.getElementById('profile-state')?.value,
    zip_code: document.getElementById('profile-zip-code')?.value,
    bio: document.getElementById('profile-bio')?.value,
    hourly_rate: Number.parseFloat(document.getElementById('profile-hourly-rate')?.value) || null
  };
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const resp = await fetch('/api/provider/profile/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify(fields)
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Save failed');

    providerProfile = { ...providerProfile, ...fields };
    if (result.slug) providerProfile.directory_slug = result.slug;

    showToast('Profile saved!', 'success');
    
    const displayName = fields.business_name || providerProfile.full_name || 'Provider';
    document.getElementById('user-name').textContent = displayName;
    
  } catch (err) {
    console.error('Save profile error:', err);
    showToast('Failed to save profile', 'error');
  }
}

// ========== MATCH PREFERENCES (Task #389) ==========
async function loadMatchPreferences() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const resp = await fetch('/api/provider/match-preferences', {
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    if (!resp.ok) return;
    const prefs = await resp.json();
    if (!prefs) return;

    const cats = Array.isArray(prefs.match_categories) ? prefs.match_categories : [];
    document.querySelectorAll('.match-category-check').forEach(cb => {
      cb.checked = cats.length === 0 ? true : cats.includes(cb.value);
    });

    const radiusInput = document.getElementById('match-radius-miles');
    if (radiusInput) radiusInput.value = prefs.match_radius_miles || 25;

    const pausedToggle = document.getElementById('match-paused-toggle');
    if (pausedToggle) {
      pausedToggle.checked = !!prefs.matches_paused;
      pausedToggle.onchange = toggleMatchPausedUntilRow;
    }
    const untilInput = document.getElementById('match-paused-until');
    if (untilInput && prefs.matches_paused_until) {
      untilInput.value = String(prefs.matches_paused_until).slice(0, 10);
    } else if (untilInput) {
      untilInput.value = '';
    }
    toggleMatchPausedUntilRow();

    if (typeof updateMatchPauseBanner === 'function') updateMatchPauseBanner(prefs);
  } catch (err) {
    console.warn('loadMatchPreferences error:', err.message);
  }
}

function toggleMatchPausedUntilRow() {
  const toggle = document.getElementById('match-paused-toggle');
  const row = document.getElementById('match-paused-until-row');
  if (row) row.style.display = toggle?.checked ? '' : 'none';
}

function showMatchPrefsError(msg) {
  const box = document.getElementById('match-prefs-error');
  if (!box) return;
  if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
  box.textContent = msg;
  box.style.display = '';
}

async function saveMatchPreferences() {
  showMatchPrefsError('');
  const categories = Array.from(document.querySelectorAll('.match-category-check:checked')).map(cb => cb.value);
  const radiusRaw = document.getElementById('match-radius-miles')?.value;
  const radius = Number.parseInt(radiusRaw, 10);
  const paused = !!document.getElementById('match-paused-toggle')?.checked;
  const untilRaw = document.getElementById('match-paused-until')?.value || null;

  if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
    showMatchPrefsError('Match radius must be between 1 and 500 miles.');
    return;
  }
  if (!paused && categories.length === 0) {
    showMatchPrefsError('Select at least one category, or pause matches.');
    return;
  }

  let pausedUntilIso = null;
  if (paused && untilRaw) {
    const d = new Date(untilRaw + 'T23:59:59');
    if (!Number.isNaN(d.getTime())) pausedUntilIso = d.toISOString();
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const resp = await fetch('/api/provider/match-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({
        match_categories: categories,
        match_radius_miles: radius,
        matches_paused: paused,
        matches_paused_until: pausedUntilIso
      })
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Save failed');
    showToast('Match preferences saved!', 'success');
    if (typeof updateMatchPauseBanner === 'function') updateMatchPauseBanner(result.preferences || result);
  } catch (err) {
    console.error('saveMatchPreferences error:', err);
    showMatchPrefsError(err.message || 'Failed to save preferences');
  }
}

async function resumeMatchesFromBanner() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const resp = await fetch('/api/provider/match-preferences/resume', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    if (!resp.ok) throw new Error('Resume failed');
    showToast('Matches resumed.', 'success');
    const banner = document.getElementById('match-pause-banner');
    if (banner) banner.style.display = 'none';
    const toggle = document.getElementById('match-paused-toggle');
    if (toggle) { toggle.checked = false; toggleMatchPausedUntilRow(); }
    const untilInput = document.getElementById('match-paused-until');
    if (untilInput) untilInput.value = '';
  } catch (err) {
    showToast('Could not resume matches.', 'error');
  }
}

function updateMatchPauseBanner(prefs) {
  const banner = document.getElementById('match-pause-banner');
  const detail = document.getElementById('match-pause-banner-detail');
  if (!banner) return;
  if (!prefs || !prefs.matches_paused) { banner.style.display = 'none'; return; }
  const until = prefs.matches_paused_until ? new Date(prefs.matches_paused_until) : null;
  if (until && until.getTime() <= Date.now()) { banner.style.display = 'none'; return; }
  if (detail) {
    detail.textContent = until
      ? `You won't receive new match invitations until ${until.toLocaleDateString()}.`
      : `You won't receive new match invitations until you resume.`;
  }
  banner.style.display = '';
}

window.loadMatchPreferences = loadMatchPreferences;
window.saveMatchPreferences = saveMatchPreferences;
window.toggleMatchPausedUntilRow = toggleMatchPausedUntilRow;
window.resumeMatchesFromBanner = resumeMatchesFromBanner;
window.updateMatchPauseBanner = updateMatchPauseBanner;

async function saveEmergencySettings() {
  const enabled = document.getElementById('emergency-accept-calls')?.checked;
  const radius = Number.parseInt(document.getElementById('emergency-radius')?.value) || 15;
  const is24Seven = document.getElementById('emergency-24-7')?.checked;
  const canTow = document.getElementById('emergency-can-tow')?.checked;
  
  const services = [];
  document.querySelectorAll('.emergency-service-check:checked').forEach(cb => {
    services.push(cb.value);
  });
  
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({
        emergency_enabled: enabled,
        emergency_radius: radius,
        emergency_services: services,
        is_24_seven: is24Seven,
        can_tow: canTow
      })
      .eq('id', currentUser.id);
    
    if (error) throw error;
    
    providerProfile.emergency_enabled = enabled;
    providerProfile.emergency_radius = radius;
    providerProfile.emergency_services = services;
    providerProfile.is_24_seven = is24Seven;
    providerProfile.can_tow = canTow;
    
    showToast('Emergency settings saved!', 'success');
    
  } catch (err) {
    console.error('Save emergency settings error:', err);
    showToast('Failed to save settings', 'error');
  }
}

// ========== TEAM MANAGEMENT ==========
let teamMembers = [];

async function loadTeamManagementData() {
  await Promise.all([
    loadTeamMembers(),
    loadTeamInvites()
  ]);
}

async function loadTeamMembers() {
  const container = document.getElementById('team-members-list');
  if (!container) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('team_members')
      .select('*')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    teamMembers = data || [];
    renderTeamMembers();
    
  } catch (err) {
    console.error('Error loading team members:', err);
    container.innerHTML = '<div class="empty-state"><p>Failed to load team members.</p></div>';
  }
}

function renderTeamMembers() {
  const container = document.getElementById('team-members-list');
  if (!container) return;
  
  if (!teamMembers.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('users', 14)}</div><p>No team members yet. Invite your first team member!</p></div>`;
    return;
  }
  
  container.innerHTML = teamMembers.map(member => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--accent-gold),#c49a45);display:flex;align-items:center;justify-content:center;color:#0a0a0f;font-weight:600;">
          ${(member.name || 'T')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-weight:600;">${member.name || 'Team Member'}</div>
          <div style="font-size:0.85rem;color:var(--text-muted);">${member.role || 'Staff'} • ${member.email || ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="editTeamMember('${member.id}')">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="removeTeamMember('${member.id}')" style="color:var(--accent-red);">✕</button>
      </div>
    </div>
  `).join('');
}

async function loadTeamInvites() {
  const container = document.getElementById('team-invites-list');
  if (!container) return;
  
  try {
    const { data } = await supabaseClient
      .from('team_invites')
      .select('*')
      .eq('provider_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No pending invites.</p>';
      return;
    }
    
    container.innerHTML = data.map(invite => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:8px;">
        <div>
          <div style="font-weight:500;">${invite.email}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Sent ${formatTimeAgo(invite.created_at)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="cancelTeamInvite('${invite.id}')" style="color:var(--accent-red);">Cancel</button>
      </div>
    `).join('');
    
  } catch (err) {
    console.error('Error loading invites:', err);
  }
}

function openInviteTeamModal() {
  document.getElementById('invite-email').value = '';
  document.getElementById('invite-role').value = 'technician';
  openModal('invite-team-modal');
}

async function sendTeamInvite() {
  const email = document.getElementById('invite-email')?.value?.trim();
  const role = document.getElementById('invite-role')?.value || 'technician';
  
  if (!email) {
    showToast('Please enter an email address', 'error');
    return;
  }

  // Enforce shop seat limits before allowing invite
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const statusRes = await fetch(`${apiBase}/api/saas/shop-status`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const statusData = await statusRes.json();
      if (statusData.plan !== 'none') {
        const seatLimit = statusData.seat_limit;
        const seatCount = statusData.seat_count;
        if (seatLimit !== 999 && seatCount >= seatLimit) {
          showToast(`Seat limit reached (${seatCount}/${seatLimit}). Upgrade your plan to add more team members.`, 'error');
          if (typeof openShopUpgradeModal === 'function') openShopUpgradeModal();
          return;
        }
      }
    }
  } catch (seatErr) {
    console.warn('[Seat limit check] Failed, proceeding without check:', seatErr);
  }
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const serverRole = (role === 'technician') ? 'staff' : (role || 'staff');
    const inviteRes = await fetch(`${apiBase}/api/providers/${currentUser.id}/team/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ email, role: serverRole })
    });
    const inviteData = await inviteRes.json();
    if (!inviteRes.ok) throw new Error(inviteData.error || 'Failed to send invite');
    
    closeModal('invite-team-modal');
    showToast('Invite sent!', 'success');
    await loadTeamInvites();
    
  } catch (err) {
    console.error('Send invite error:', err);
    showToast('Failed to send invite: ' + err.message, 'error');
  }
}

async function cancelTeamInvite(inviteId) {
  if (!confirm('Cancel this invite?')) return;
  
  try {
    await supabaseClient.from('team_invites').delete().eq('id', inviteId);
    showToast('Invite cancelled', 'success');
    await loadTeamInvites();
  } catch (err) {
    console.error('Cancel invite error:', err);
    showToast('Failed to cancel invite', 'error');
  }
}

function editTeamMember(memberId) {
  const member = teamMembers.find(m => m.id === memberId);
  if (!member) return;
  
  document.getElementById('edit-member-id').value = memberId;
  document.getElementById('edit-member-name').value = member.name || '';
  document.getElementById('edit-member-role').value = member.role || 'technician';
  
  openModal('edit-team-modal');
}

async function saveTeamMember() {
  const memberId = document.getElementById('edit-member-id')?.value;
  const name = document.getElementById('edit-member-name')?.value?.trim();
  const role = document.getElementById('edit-member-role')?.value;
  
  if (!memberId || !name) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  
  try {
    const { error } = await supabaseClient
      .from('team_members')
      .update({ name, role })
      .eq('id', memberId);
    
    if (error) throw error;
    
    closeModal('edit-team-modal');
    showToast('Team member updated!', 'success');
    await loadTeamMembers();
    
  } catch (err) {
    console.error('Save team member error:', err);
    showToast('Failed to save changes', 'error');
  }
}

async function removeTeamMember(memberId) {
  const member = teamMembers.find(m => m.id === memberId);
  if (!member) return;
  
  if (!confirm(`Remove ${member.name || 'this team member'}?`)) return;
  
  try {
    const { error } = await supabaseClient
      .from('team_members')
      .delete()
      .eq('id', memberId);
    
    if (error) throw error;
    
    showToast('Team member removed', 'success');
    await loadTeamMembers();
    
  } catch (err) {
    console.error('Remove team member error:', err);
    showToast('Failed to remove team member', 'error');
  }
}

// ========== BACKGROUND CHECKS ==========

let _bgCheckPollTimer = null;

function _clearBgCheckPoll() {
  if (_bgCheckPollTimer) { clearInterval(_bgCheckPollTimer); _bgCheckPollTimer = null; }
}

// Clean up poll timer on page unload / session teardown
window.addEventListener('beforeunload', _clearBgCheckPoll, { once: false });

function _startBgCheckPoll(status) {
  _clearBgCheckPoll();
  const inProgress = ['initiated','pending','processing'].includes(status);
  if (inProgress) {
    _bgCheckPollTimer = setInterval(() => {
      loadBackgroundCheckStatus({ silent: true });
    }, 20000);
  }
}

const BG_STATUS_CONFIG = {
  initiated:    { color: 'var(--accent-blue)',   label: 'Initiated',    icon: '⏳' },
  pending:      { color: 'var(--accent-gold)',   label: 'Pending',      icon: '⏳' },
  processing:   { color: 'var(--accent-blue)',   label: 'Processing',   icon: '🔍' },
  eligible:     { color: 'var(--accent-green)',  label: 'Clear / Eligible', icon: '✅' },
  clear:        { color: 'var(--accent-green)',  label: 'Clear',        icon: '✅' },
  needs_review: { color: 'var(--accent-orange)', label: 'Needs Review', icon: '⚠️' },
  not_eligible: { color: 'var(--accent-red)',    label: 'Not Eligible', icon: '🚫' },
  suspended:    { color: 'var(--accent-red)',     label: 'Suspended',    icon: '🚫' },
  canceled:     { color: 'var(--text-muted)',    label: 'Canceled',     icon: '—'  },
  disputed:     { color: 'var(--accent-orange)', label: 'Disputed',     icon: '⚠️' },
};

function bgCheckStatusBadge(status) {
  const cfg = BG_STATUS_CONFIG[status] || { color: 'var(--text-muted)', label: status, icon: '—' };
  return `<span style="padding:3px 10px;border-radius:100px;font-size:0.78rem;font-weight:600;background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44;">${cfg.icon} ${cfg.label}</span>`;
}

async function loadBackgroundCheckStatus(opts = {}) {
  const silent = opts?.silent || false;
  const providerContainer = document.getElementById('provider-check-content');
  const teamContainer     = document.getElementById('team-checks-list');
  const dashCard          = document.getElementById('bg-check-dashboard-status');

  if (!providerContainer && !teamContainer && !dashCard) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const effectiveId = providerProfile?.team_provider_id || currentUser?.id;
    const response = await fetch(`/api/bgcheck/status/${effectiveId}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch background check status');
    const data = await response.json();
    const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ---- Provider's own check ----
    if (providerContainer) {
      const pc = data.providerCheck;
      if (!pc) {
        providerContainer.innerHTML = `
          <div style="text-align:center;padding:32px 20px;color:var(--text-muted);">
            <div style="font-size:2.5rem;margin-bottom:12px;">🛡️</div>
            <p style="font-weight:500;margin-bottom:8px;">No background check on file</p>
            <p style="font-size:0.85rem;margin-bottom:20px;">Verified providers earn a trust badge visible to customers on bids and profile.</p>
            <button class="btn btn-primary" onclick="openBackgroundCheckModal('provider')">
              ${mccIcon('shield', 16)} Start My Background Check
            </button>
          </div>`;
      } else {
        const statusCfg = BG_STATUS_CONFIG[pc.status] || {};
        const initiationDate = new Date(pc.created_at).toLocaleDateString();
        const completedDate = pc.completed_at ? new Date(pc.completed_at).toLocaleDateString() : null;
        const showReport = ['eligible','clear','needs_review','not_eligible'].includes(pc.status);
        providerContainer.innerHTML = `
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
            <div style="font-size:2.5rem;">${statusCfg.icon || '🛡️'}</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:1rem;margin-bottom:6px;">${bgCheckStatusBadge(pc.status)}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">
                Initiated ${initiationDate}${completedDate ? ` · Completed ${completedDate}` : ''}
              </div>
              ${pc.subject_first_name ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">${pc.subject_first_name} ${pc.subject_last_name || ''}</div>` : ''}
            </div>
            ${showReport && pc.id ? `<button class="btn btn-secondary btn-sm" onclick="viewBgCheckReport('${pc.id}')">${mccIcon('external-link', 14)} View Report</button>` : ''}
          </div>
          ${['pending','processing','initiated'].includes(pc.status) ? `
            <div style="padding:12px 14px;background:var(--accent-blue-soft);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius-md);font-size:0.85rem;color:var(--accent-blue);">
              ${mccIcon('clock', 14)} Check is in progress. Results typically arrive within 24–72 hours.
            </div>` : ''}
          ${pc.invitation_url && ['initiated','pending'].includes(pc.status) ? `
            <div style="margin-top:12px;padding:12px 14px;background:var(--accent-gold-soft);border:1px solid rgba(201,162,39,0.3);border-radius:var(--radius-md);font-size:0.85rem;">
              <strong style="color:var(--accent-gold);">Action needed:</strong> Complete your application at BackgroundChecks.com.
              <a href="${pc.invitation_url}" target="_blank" rel="noopener" class="btn btn-sm btn-gold" style="margin-inline-start:12px;">Open Application</a>
            </div>` : ''}
          <div style="margin-top:14px;display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="loadBackgroundCheckStatus()">${mccIcon('refresh-cw', 14)} Refresh</button>
            ${['canceled','not_eligible'].includes(pc.status) ? `<button class="btn btn-primary btn-sm" onclick="openBackgroundCheckModal('provider')">${mccIcon('shield', 14)} Re-initiate</button>` : ''}
          </div>`;
      }
    }

    // ---- Team member checks ----
    if (teamContainer) {
      const checks = data.employeeChecks || [];
      if (!checks.length) {
        teamContainer.innerHTML = `
          <div style="text-align:center;padding:32px 20px;color:var(--text-muted);">
            <div style="font-size:2.5rem;margin-bottom:12px;">👥</div>
            <p style="margin-bottom:4px;">No team member checks yet.</p>
            <p style="font-size:0.85rem;">Add team members to run checks and earn the Team Verified badge.</p>
          </div>`;
      } else {
        teamContainer.innerHTML = checks.map(c => {
          const showReport = ['eligible','clear','needs_review','not_eligible'].includes(c.status);
          return `
            <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:10px;border:1px solid var(--border-subtle);">
              <div style="font-size:1.5rem;">${BG_STATUS_CONFIG[c.status]?.icon || '🛡️'}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;margin-bottom:4px;">${c.subject_first_name || 'Team Member'} ${c.subject_last_name || ''}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${c.subject_email || ''}</div>
                <div style="margin-top:6px;">${bgCheckStatusBadge(c.status)}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
                ${showReport && c.id ? `<button class="btn btn-secondary btn-sm" onclick="viewBgCheckReport('${c.id}')">${mccIcon('external-link', 14)} Report</button>` : ''}
                ${c.invitation_url && ['initiated','pending'].includes(c.status) ? `<a href="${c.invitation_url}" target="_blank" rel="noopener" class="btn btn-sm btn-gold">Open Form</a>` : ''}
              </div>
            </div>`;
        }).join('');
      }
    }
    // ---- Dashboard card update (overview section) ----
    if (dashCard) {
      const pc = data.providerCheck;
      if (!pc) {
        dashCard.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="font-size:0.85rem;color:var(--text-muted);">No background check on file.</div>
            <button class="btn btn-primary btn-sm" onclick="openBackgroundCheckModal('provider')" style="white-space:nowrap;">🛡️ Start Check</button>
          </div>`;
        _clearBgCheckPoll();
      } else {
        const cfg = BG_STATUS_CONFIG[pc.status] || {};
        const updatedAt = pc.updated_at ? new Date(pc.updated_at).toLocaleDateString() : lastUpdated;
        const showReport = ['eligible','clear','needs_review','not_eligible'].includes(pc.status);
        dashCard.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              ${bgCheckStatusBadge(pc.status)}
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">Updated ${updatedAt} · <span style="color:var(--text-muted);">Last checked ${lastUpdated}</span></div>
            </div>
            ${showReport && pc.id ? `<button class="btn btn-secondary btn-sm" onclick="viewBgCheckReport('${pc.id}')" style="white-space:nowrap;flex-shrink:0;">View Report</button>` : ''}
            ${['initiated','pending','processing'].includes(pc.status) ? `<div style="font-size:0.75rem;color:var(--accent-blue);white-space:nowrap;">Auto-refreshing…</div>` : ''}
          </div>`;
        _startBgCheckPoll(pc.status);
      }
    }

    // ---- Profile-level cleared badge ----
    const profileBadge = document.getElementById('bg-check-profile-badge');
    if (profileBadge) {
      const pc = data.providerCheck;
      const isCleared = pc && ['eligible', 'clear'].includes(pc.status);
      if (isCleared) {
        profileBadge.style.display = 'inline-flex';
        profileBadge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:100px;font-size:0.78rem;font-weight:600;background:rgba(74,200,140,0.15);color:var(--accent-green);border:1px solid rgba(74,200,140,0.35);" title="Background check cleared by BackgroundChecks.com">✅ Background Cleared</span>`;
      } else {
        profileBadge.style.display = 'none';
      }
    }

  } catch (err) {
    console.error('Error loading background check status:', err);
    if (!opts?.silent) {
      const errMsg = `<div style="padding:16px;color:var(--text-muted);font-size:0.9rem;">Unable to load check status. Please try again.</div>`;
      if (providerContainer) providerContainer.innerHTML = errMsg;
      if (teamContainer) teamContainer.innerHTML = errMsg;
      if (dashCard) dashCard.innerHTML = `<div style="font-size:0.85rem;color:var(--text-muted);">Unable to load</div>`;
    }
  }
}

function openBackgroundCheckModal(subjectType) {
  const typeSelect = document.getElementById('bg-check-type');
  const emailInput = document.getElementById('bg-check-email');
  const firstInput = document.getElementById('bg-check-first-name');
  const lastInput  = document.getElementById('bg-check-last-name');
  const empFields  = document.getElementById('bg-check-employee-fields');

  if (subjectType === 'team_member' || subjectType === 'employee') {
    if (typeSelect) typeSelect.value = 'employee';
    if (empFields) empFields.style.display = 'block';
    if (emailInput) emailInput.value = '';
    if (firstInput) firstInput.value = '';
    if (lastInput)  lastInput.value  = '';
    _populateBgCheckTeamMemberSelect();
  } else {
    if (typeSelect) typeSelect.value = 'provider';
    if (empFields) empFields.style.display = 'none';
    if (emailInput) emailInput.value = currentUser?.email || '';
    if (firstInput) {
      const parts = (providerProfile?.full_name || '').split(' ');
      firstInput.value = parts[0] || '';
      if (lastInput) lastInput.value = parts.slice(1).join(' ') || '';
    }
  }

  openModal('background-check-modal');
}

function _populateBgCheckTeamMemberSelect() {
  const sel = document.getElementById('bg-check-team-member');
  if (!sel) return;
  const members = Array.isArray(teamMembers) ? teamMembers : [];
  sel.innerHTML = '<option value="">Select a team member...</option>' +
    members.map(m => {
      const displayName = m.name || m.full_name || '';
      return `<option value="${m.id}" data-email="${m.email || ''}" data-name="${displayName}">${displayName || m.email || m.id}</option>`;
    }).join('');
  sel.onchange = function() {
    const opt = sel.options[sel.selectedIndex];
    const email = opt.getAttribute('data-email') || '';
    const name  = opt.getAttribute('data-name')  || '';
    const emailInput = document.getElementById('bg-check-email');
    const firstInput = document.getElementById('bg-check-first-name');
    const lastInput  = document.getElementById('bg-check-last-name');
    if (emailInput) emailInput.value = email;
    if (name && firstInput) {
      const parts = name.split(' ');
      firstInput.value = parts[0] || '';
      if (lastInput) lastInput.value = parts.slice(1).join(' ') || '';
    }
  };
}

function updateBgCheckForm() {
  const type = document.getElementById('bg-check-type')?.value;
  const employeeFields = document.getElementById('bg-check-employee-fields');
  const emailInput = document.getElementById('bg-check-email');

  if (type === 'employee') {
    if (employeeFields) employeeFields.style.display = 'block';
    if (emailInput) emailInput.value = '';
    _populateBgCheckTeamMemberSelect();
  } else {
    if (employeeFields) employeeFields.style.display = 'none';
    if (emailInput) emailInput.value = currentUser?.email || '';
    const firstInput = document.getElementById('bg-check-first-name');
    const lastInput  = document.getElementById('bg-check-last-name');
    if (firstInput) {
      const parts = (providerProfile?.full_name || '').split(' ');
      firstInput.value = parts[0] || '';
      if (lastInput) lastInput.value = parts.slice(1).join(' ') || '';
    }
  }
}

async function submitBackgroundCheck() {
  const type      = document.getElementById('bg-check-type')?.value;
  const firstName = document.getElementById('bg-check-first-name')?.value?.trim();
  const lastName  = document.getElementById('bg-check-last-name')?.value?.trim();
  const email     = document.getElementById('bg-check-email')?.value?.trim();
  const state     = document.getElementById('bg-check-state')?.value;
  const phone     = document.getElementById('bg-check-phone')?.value?.trim();
  const teamMemberSelect = document.getElementById('bg-check-team-member');
  const teamMemberId = teamMemberSelect?.value || null;

  const fcraAck = document.getElementById('bg-check-fcra-ack')?.checked;
  if (!firstName) { showToast('Please enter first name', 'error'); return; }
  if (!lastName)  { showToast('Please enter last name', 'error');  return; }
  if (!email)     { showToast('Please enter email address', 'error'); return; }
  if (!state)     { showToast('Please select work state', 'error'); return; }
  if (!fcraAck)   { showToast('You must acknowledge the FCRA disclosure before initiating a background check', 'error'); return; }

  const btn = document.getElementById('bg-check-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const providerId = providerProfile?.team_provider_id || currentUser?.id;
    const response = await fetch('/api/bgcheck/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        providerId,
        subjectType: type === 'employee' ? 'employee' : 'provider',
        employeeId: type === 'employee' ? (teamMemberId || null) : null,
        firstName,
        lastName,
        email,
        state,
        phone: phone || undefined,
        providerEmail: currentUser?.email || undefined,
        providerName: providerProfile?.business_name || providerProfile?.full_name || undefined,
        fcraAcknowledged: true
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to initiate background check');

    closeModal('background-check-modal');
    await loadBackgroundCheckStatus();

    if (data.apiConfigured === false) {
      showToast('Background check request saved. A BackgroundChecks.com API key is not yet configured — admin will be notified to complete setup.', 'warning');
    } else if (data.applicantUrl) {
      showToast('Background check initiated! Invitation sent — opening application link…', 'success');
      setTimeout(() => window.open(data.applicantUrl, '_blank'), 800);
    } else {
      showToast('Background check initiated! An invitation has been sent to the provided email.', 'success');
    }
  } catch (err) {
    console.error('Background check error:', err);
    showToast(err.message || 'Failed to initiate background check', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${mccIcon('shield', 16)} Initiate Check`; }
  }
}

async function viewBgCheckReport(checkId) {
  const modal = document.getElementById('bg-report-viewer-modal');
  const iframe = document.getElementById('bg-report-viewer-iframe');
  const loader = document.getElementById('bg-report-viewer-loader');
  const errorEl = document.getElementById('bg-report-viewer-error');

  if (!modal || !iframe) return;

  // Reset state
  iframe.style.display = 'none';
  if (loader)  { loader.style.display = 'flex'; loader.textContent = 'Loading report…'; }
  if (errorEl) errorEl.style.display = 'none';
  openModal('bg-report-viewer-modal');

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const response = await fetch(`/api/bgcheck/report-url/${checkId}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load report');

    if (!data.reportUrl) {
      throw new Error('Report not yet available. Check back after the background check completes.');
    }

    iframe.src = data.reportUrl;
    iframe.onload = () => {
      if (loader) loader.style.display = 'none';
      iframe.style.display = 'block';
    };
    iframe.onerror = () => {
      if (loader) loader.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = `Unable to embed report. <a href="${data.reportUrl}" target="_blank" rel="noopener" style="color:var(--accent-gold);">Open in new tab →</a>`;
      }
    };
  } catch (err) {
    console.error('viewBgCheckReport error:', err);
    if (loader) loader.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = err.message || 'Could not load report';
    }
  }
}

// ========== VERIFICATION BADGE STATUS ==========
async function loadVerificationBadgeStatus() {
  const container = document.getElementById('verification-badge-container');
  if (!container) return;

  try {
    // Use team_provider_id for team members, otherwise use own ID (for provider owners)
    const effectiveProviderId = providerProfile?.team_provider_id || currentUser.id;
    const token = await supabaseClient.auth.getSession().then(s => s.data?.session?.access_token);
    const response = await fetch(`/api/provider-verification-status/${effectiveProviderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to fetch verification status');
    const data = await response.json();

    const badgeIcon = data.badgeEarned ? '✅' : `${mccIcon('lock', 14)}`;
    const badgeColor = data.badgeEarned ? 'var(--accent-green)' : 'var(--text-muted)';
    const statusText = data.badgeEarned 
      ? 'All employees verified! Badge earned.' 
      : data.totalEmployees === 0 
        ? 'Add team members to start earning the badge.'
        : `${data.verifiedEmployees} of ${data.totalEmployees} employees verified`;

    let pendingHtml = '';
    if (data.pendingEmployees && data.pendingEmployees.length > 0) {
      pendingHtml = `
        <div style="margin-top:16px;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--text-primary);">⏳ Employees Needing Verification:</div>
          ${data.pendingEmployees.map(emp => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:6px;">
              <span style="color:var(--accent-orange);">○</span>
              <span>${emp.name}</span>
              <span style="color:var(--text-muted);font-size:0.85rem;">(${emp.role})</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div style="background:linear-gradient(135deg, var(--bg-elevated), var(--bg-input));border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
          <div style="font-size:2.5rem;">${badgeIcon}</div>
          <div>
            <div style="font-weight:700;font-size:1.1rem;color:${badgeColor};">
              ${data.badgeEarned ? 'Team Verified Badge' : 'Earn Your Team Verified Badge'}
            </div>
            <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:2px;">
              ${statusText}
            </div>
          </div>
        </div>
        
        ${data.totalEmployees > 0 ? `
          <div style="margin-top:16px;">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">
              <span>Progress</span>
              <span>${data.verifiedEmployees}/${data.totalEmployees}</span>
            </div>
            <div style="background:var(--bg-input);border-radius:var(--radius-full);height:8px;overflow:hidden;">
              <!-- RTL note (Task #410): 90deg gradient is cosmetic on a width-driven progress bar (intentionally physical). Follow-up #506. -->
              <div style="background:linear-gradient(90deg, var(--accent-green), #4ade80);height:100%;width:${data.totalEmployees > 0 ? (data.verifiedEmployees / data.totalEmployees * 100) : 0}%;transition:width 0.3s ease;"></div>
            </div>
          </div>
        ` : ''}
        
        ${pendingHtml}
        
        <div style="margin-top:20px;padding:12px;background:rgba(234,179,8,0.1);border-radius:var(--radius-md);border-inline-start:3px solid var(--accent-gold);">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:1.1rem;">${mccIcon('lightbulb', 14)}</span>
            <div style="font-size:0.85rem;color:var(--text-secondary);">
              <strong>This is voluntary.</strong> Earning the Team Verified badge shows potential customers that all your team members have passed background checks. This can help build trust and may increase your job opportunities.
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error loading verification badge status:', err);
    container.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-muted);">
        <p>Unable to load verification status</p>
      </div>
    `;
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
      console.log('Notifications error:', error);
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
  const label = unreadCount > 9 ? '9+' : String(unreadCount);
  ['notif-count', 'header-notif-count', 'header-notif-count-desktop'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (unreadCount > 0) {
      el.textContent = label;
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  });
}

function renderNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;
  
  if (!notifications.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('bell', 14)}</div><p>No notifications yet.</p></div>`;
    return;
  }

  const notifIcons = {
    'bid_accepted': `${mccIcon('party-popper', 14)}`,
    'new_package': `${mccIcon('package', 14)}`,
    'message_received': `${mccIcon('message-square', 14)}`,
    'payment_received': `${mccIcon('dollar-sign', 14)}`,
    'review_received': '⭐',
    'default': `${mccIcon('bell', 14)}`
  };

  container.innerHTML = notifications.map(n => {
    const icon = notifIcons[n.type] || notifIcons['default'];
    const timeAgo = formatTimeAgo(n.created_at);
    
    return `
      <div class="notification-item" onclick="handleNotificationClick('${n.id}', '${n.link_type || ''}', '${n.link_id || ''}')" style="display:flex;gap:16px;padding:16px 20px;background:${n.read ? 'var(--bg-card)' : 'var(--accent-gold-soft)'};border:1px solid ${n.read ? 'var(--border-subtle)' : 'rgba(212,168,85,0.3)'};border-radius:var(--radius-md);margin-bottom:12px;cursor:pointer;">
        <div style="font-size:24px;">${icon}</div>
        <div style="flex:1;">
          <div style="font-weight:${n.read ? '400' : '600'};margin-bottom:4px;">${n.title}</div>
          ${n.message ? `<div style="font-size:0.9rem;color:var(--text-secondary);">${n.message}</div>` : ''}
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">${timeAgo}</div>
        </div>
        ${!n.read ? '<div style="width:10px;height:10px;background:var(--accent-gold);border-radius:50%;"></div>' : ''}
      </div>
    `;
  }).join('');
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

  showToast('All marked as read', 'success');
  await loadNotifications();
}

// ========== LOYALTY NETWORK & REFERRALS ==========
async function loadLoyaltyNetwork() {
  await Promise.all([
    loadLoyaltyQrCode(),
    loadLoyaltyReferrals()
  ]);
}

async function loadLoyaltyQrCode() {
  const container = document.getElementById('loyalty-qr-container');
  if (!container) return;
  
  try {
    const referralLink = `${window.location.origin}/signup-loyal-customer.html?ref=${currentUser.id}`;
    
    container.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div id="loyalty-qr-code" style="display:inline-block;background:#fff;padding:16px;border-radius:12px;"></div>
        <p style="margin-top:12px;font-size:0.9rem;color:var(--text-secondary);">Scan to join your loyalty network</p>
        <input type="text" value="${referralLink}" readonly style="width:100%;margin-top:12px;padding:8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:0.85rem;text-align:center;" onclick="this.select()">
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="copyLoyaltyLink()">${mccIcon('clipboard-list', 14)} Copy Link</button>
      </div>
    `;
    
    if (typeof QRCreator !== 'undefined') {
      QRCreator.render({
        text: referralLink,
        radius: 0.4,
        ecLevel: 'M',
        fill: '#c9a227',
        background: '#ffffff',
        size: 180
      }, document.getElementById('loyalty-qr-code'));
    }
    
  } catch (err) {
    console.error('Error loading QR code:', err);
  }
}

function copyLoyaltyLink() {
  const link = `${window.location.origin}/signup-loyal-customer.html?ref=${currentUser.id}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copied!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

async function loadLoyaltyReferrals() {
  const container = document.getElementById('loyalty-referrals-list');
  if (!container) return;
  
  try {
    const { data } = await supabaseClient
      .from('profiles')
      .select('id, full_name, created_at')
      .eq('referred_by_provider_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('share-2', 14)}</div><p>No referrals yet. Share your QR code!</p></div>`;
      return;
    }
    
    const statsEl = document.getElementById('loyalty-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="loyalty-qr-stat">
          <span class="loyalty-qr-stat-icon">${mccIcon('users', 14)}</span>
          <div>
            <div class="loyalty-qr-stat-value">${data.length}</div>
            <div class="loyalty-qr-stat-label">Referrals</div>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = data.map(r => `
      <div class="loyalty-referral-item">
        <div class="loyalty-referral-avatar loyal-customer">${(r.full_name || 'C')[0].toUpperCase()}</div>
        <div class="loyalty-referral-info">
          <div class="loyalty-referral-name">${r.full_name || 'Customer'}</div>
          <div class="loyalty-referral-date">Joined ${formatTimeAgo(r.created_at)}</div>
        </div>
        <span class="referral-type-badge loyal-customer">⭐ Loyal Customer</span>
      </div>
    `).join('');
    
  } catch (err) {
    console.error('Error loading referrals:', err);
  }
}

// ========== REFERRAL SECTION ==========
async function loadReferralSection() {
  await loadProviderReferrals();
}

async function loadProviderReferrals() {
  const container = document.getElementById('provider-referrals-list');
  if (!container) return;
  
  try {
    const { data } = await supabaseClient
      .from('provider_referrals')
      .select('*, referred:referred_user_id(business_name, full_name, email)')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('hand-helping', 14)}</div><p>No provider referrals yet.</p></div>`;
      return;
    }
    
    container.innerHTML = data.map(r => {
      const name = r.referred?.business_name || r.referred?.full_name || 'Provider';
      const statusClass = r.status === 'completed' ? 'accent-green' : r.status === 'pending' ? 'accent-gold' : 'text-muted';
      
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;">
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">Referred ${formatTimeAgo(r.created_at)}</div>
          </div>
          <span style="color:var(--${statusClass});text-transform:capitalize;">${r.status}</span>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Error loading provider referrals:', err);
  }
}

// ========== QR CHECK-IN SETTINGS ==========
async function loadQrCheckinSetting() {
  const toggle = document.getElementById('qr-checkin-toggle');
  if (!toggle) return;
  
  try {
    if (providerProfile && typeof providerProfile.qr_checkin_enabled !== 'undefined') {
      toggle.checked = providerProfile.qr_checkin_enabled === true;
    }
  } catch (err) {
    console.error('Error loading QR check-in setting:', err);
  }
}

async function toggleQrCheckin(enabled) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast('Please log in to update settings', 'error');
      return;
    }
    
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/provider/settings/qr-checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ enabled })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update QR check-in setting');
    }
    
    providerProfile.qr_checkin_enabled = enabled;
    showToast(enabled ? 'QR Check-in enabled!' : 'QR Check-in disabled', 'success');
    
  } catch (err) {
    console.error('Error updating QR check-in setting:', err);
    showToast('Failed to update QR check-in setting', 'error');
    const toggle = document.getElementById('qr-checkin-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

function initPublicProfileCard() {
  const checkbox = document.getElementById('directory-opt-in');
  const linkSection = document.getElementById('public-profile-link-section');
  if (!checkbox || !providerProfile) return;

  checkbox.checked = !!providerProfile.directory_opt_in;
  if (providerProfile.directory_opt_in && providerProfile.directory_slug) {
    const baseUrl = window.location.origin;
    const profileUrl = baseUrl + '/p/' + providerProfile.directory_slug;
    document.getElementById('public-profile-url').value = profileUrl;
    document.getElementById('preview-profile-link').href = '/p/' + providerProfile.directory_slug;
    linkSection.style.display = 'block';
  } else {
    linkSection.style.display = 'none';
  }
}

async function toggleDirectoryOptIn() {
  const checkbox = document.getElementById('directory-opt-in');
  const optIn = checkbox.checked;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(apiBase + '/api/provider/profile/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ opt_in: optIn })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to update');

    providerProfile.directory_opt_in = data.directory_opt_in;
    providerProfile.directory_slug = data.directory_slug;

    const linkSection = document.getElementById('public-profile-link-section');
    if (data.directory_opt_in && data.directory_slug) {
      const baseUrl = window.location.origin;
      const profileUrl = baseUrl + '/p/' + data.directory_slug;
      document.getElementById('public-profile-url').value = profileUrl;
      document.getElementById('preview-profile-link').href = '/p/' + data.directory_slug;
      linkSection.style.display = 'block';
      showToast('Your public profile is now live!', 'success');
    } else {
      linkSection.style.display = 'none';
      showToast('Public profile hidden', 'info');
    }
  } catch (err) {
    console.error('Toggle directory opt-in error:', err);
    checkbox.checked = !optIn;
    showToast('Failed to update public profile setting', 'error');
  }
}

function copyProfileLink() {
  const urlInput = document.getElementById('public-profile-url');
  if (!urlInput || !urlInput.value) return;

  navigator.clipboard.writeText(urlInput.value).then(function() {
    showToast('Profile link copied!', 'success');
  }).catch(function() {
    urlInput.select();
    document.execCommand('copy');
    showToast('Profile link copied!', 'success');
  });
}

// ========== PROVIDER WEB PUSH NOTIFICATIONS (VAPID) ==========

function updateProviderWebPushUI(enabled) {
  const enableSection = document.getElementById('provider-push-enable-section');
  const enabledSection = document.getElementById('provider-push-enabled-section');
  const badge = document.getElementById('provider-push-status-badge');
  const statusText = document.getElementById('provider-push-status-text');
  const statusDesc = document.getElementById('provider-push-status-desc');

  if (enableSection) enableSection.style.display = enabled ? 'none' : 'block';
  if (enabledSection) enabledSection.style.display = enabled ? 'block' : 'none';

  if (badge) {
    badge.textContent = enabled ? 'On' : 'Off';
    badge.style.background = enabled ? 'rgba(74,200,140,0.15)' : 'rgba(239,95,95,0.15)';
    badge.style.color = enabled ? 'var(--accent-green)' : 'var(--accent-red)';
  }
  if (statusText) statusText.textContent = enabled ? 'Push Notifications Enabled' : 'Push Notifications Disabled';
  if (statusDesc) statusDesc.textContent = enabled
    ? 'You are receiving instant alerts for new bid opportunities and updates on this device.'
    : 'Enable to receive instant alerts for new bid opportunities and updates.';
}

async function loadProviderNotificationSettings() {
  const notSupported = document.getElementById('provider-push-not-supported');
  const pushContent = document.getElementById('provider-push-content');
  const nativeCard = document.getElementById('provider-native-push-card');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (notSupported) notSupported.style.display = 'block';
    if (pushContent) pushContent.style.display = 'none';
  } else {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      updateProviderWebPushUI(!!subscription);
    } catch (err) {
      console.log('[ProviderPush] Could not check subscription:', err.message);
      updateProviderWebPushUI(false);
    }
  }

  if (nativeCard) {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    nativeCard.style.display = isNative ? 'block' : 'none';
    if (isNative && typeof window.initCapacitorPush === 'function') {
      window.initCapacitorPush('provider');
    }
  }
}

async function enableProviderPushNotifications() {
  const btn = document.getElementById('provider-push-enable-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enabling…'; }

  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Push notifications are not supported in this browser.', 'error');
      return;
    }

    let permissionResult = Notification.permission;
    if (permissionResult === 'default') {
      permissionResult = await Notification.requestPermission();
    }
    if (permissionResult === 'denied') {
      showToast('Notification permission was denied. Please allow it in your browser settings.', 'error');
      updateProviderWebPushUI(false);
      return;
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const vapidResp = await fetch(`${apiBase}/api/push/vapid-key`);
    const vapidData = await vapidResp.json();
    if (!vapidData.publicKey) {
      showToast('Push notifications are not configured on this server.', 'error');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey)
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    const saveResp = await fetch(`${apiBase}/api/provider/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ subscription })
    });
    const saveResult = await saveResp.json();

    if (saveResult.success || saveResult.warning) {
      updateProviderWebPushUI(true);
      showToast('Push notifications enabled!', 'success');
    } else {
      throw new Error(saveResult.error || 'Failed to save subscription');
    }
  } catch (err) {
    console.error('[ProviderPush] Enable error:', err);
    showToast('Could not enable push notifications. Please try again.', 'error');
    updateProviderWebPushUI(false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> Enable Push Notifications';
    }
  }
}

async function disableProviderPushNotifications() {
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const { data: { session } } = await supabaseClient.auth.getSession();
    await fetch(`${apiBase}/api/provider/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
    });

    updateProviderWebPushUI(false);
    showToast('Push notifications disabled.', 'success');
  } catch (err) {
    console.error('[ProviderPush] Disable error:', err);
    showToast('Could not disable push notifications. Please try again.', 'error');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PROVIDER_PUSH_PREF_FIELDS = [
  { id: 'provider-push-bid-opportunities', key: 'push_bid_opportunities' },
  { id: 'provider-push-appointment-reminders', key: 'push_appointment_reminders' },
  { id: 'provider-push-payment-received', key: 'push_payment_received' },
  { id: 'provider-push-customer-messages', key: 'push_customer_messages' },
  { id: 'provider-push-bid-accepted', key: 'push_bid_accepted' },
  { id: 'provider-push-ai-match', key: 'push_ai_match' },
  { id: 'provider-push-car-club', key: 'push_car_club' }
];

async function loadProviderPushPreferences() {
  const firstEl = document.getElementById(PROVIDER_PUSH_PREF_FIELDS[0].id);
  if (!firstEl) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(`${apiBase}/api/provider/${session.user.id}/notification-preferences`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await resp.json();
    const prefs = data.preferences || {};
    PROVIDER_PUSH_PREF_FIELDS.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = prefs[key] !== false;
        el.addEventListener('change', saveProviderPushPreferences);
      }
    });
  } catch (err) {
    console.error('[ProviderPush] Failed to load push prefs:', err);
  }
}

async function saveProviderPushPreferences() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const preferences = {};
    PROVIDER_PUSH_PREF_FIELDS.forEach(({ id, key }) => {
      preferences[key] = document.getElementById(id)?.checked ?? true;
    });
    await fetch(`${apiBase}/api/provider/${session.user.id}/notification-preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(preferences)
    });
  } catch (err) {
    console.error('[ProviderPush] Failed to save push prefs:', err);
  }
}

console.log('providers-settings.js loaded');

// ========== PROVIDER SHOP SAAS (Task #89) ==========

async function loadShopSubscription() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/saas/shop-status`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();

    const planBadge = document.getElementById('shop-sub-plan');
    const statusBadge = document.getElementById('shop-sub-status');
    const seatBar = document.getElementById('shop-seat-bar');
    const seatText = document.getElementById('shop-seat-text');
    const featBadgeSms = document.getElementById('shop-feat-sms');
    const featBadgeAnalytics = document.getElementById('shop-feat-analytics');
    const featBadgeLoyalty = document.getElementById('shop-feat-loyalty');

    if (planBadge) {
      const labels = { starter: 'Solo – $49/mo', pro: 'Team – $99/mo', business: 'Shop – $199/mo', none: 'No Plan' };
      planBadge.textContent = labels[data.plan] || 'No Plan';
    }
    if (statusBadge) {
      const isActive = data.status === 'active' || data.status === 'trialing';
      statusBadge.textContent = data.status === 'trialing' ? 'Trial' : (data.status === 'active' ? 'Active' : 'Inactive');
      statusBadge.style.color = isActive ? '#34d399' : '#f87171';
    }

    if (seatBar && data.seat_limit && data.seat_limit > 0 && data.seat_limit < 999) {
      const pct = Math.min(100, Math.round((data.seat_count / data.seat_limit) * 100));
      seatBar.style.width = pct + '%';
      seatBar.style.background = pct >= 100 ? '#f87171' : '#c9a227';
    }
    if (seatText) {
      if (data.plan === 'business') {
        seatText.textContent = `${data.seat_count} technicians (unlimited)`;
      } else if (data.seat_limit > 0) {
        seatText.textContent = `${data.seat_count} / ${data.seat_limit} technician seats used`;
      } else {
        seatText.textContent = 'Subscribe to add team members';
      }
    }

    const access = data.feature_access || {};
    if (featBadgeSms) { featBadgeSms.textContent = access.sms_reminders ? '✓ Active' : '— Upgrade to Team'; featBadgeSms.style.color = access.sms_reminders ? '#34d399' : '#f87171'; }
    if (featBadgeAnalytics) { featBadgeAnalytics.textContent = access.advanced_analytics ? '✓ Active' : '— Upgrade to Team'; featBadgeAnalytics.style.color = access.advanced_analytics ? '#34d399' : '#f87171'; }
    if (featBadgeLoyalty) { featBadgeLoyalty.textContent = access.car_club_loyalty ? '✓ Active' : '— Upgrade to Team'; featBadgeLoyalty.style.color = access.car_club_loyalty ? '#34d399' : '#f87171'; }

    // Show upgrade prompt if on Starter or no plan
    const upgradePrompt = document.getElementById('shop-upgrade-prompt');
    if (upgradePrompt) {
      upgradePrompt.style.display = (data.plan === 'none' || data.plan === 'starter') ? 'block' : 'none';
    }

    window._shopSaasData = data;
  } catch (err) {
    console.error('[ShopSaaS] Failed to load shop subscription:', err);
  }
}

function openShopUpgradeModal() {
  const plan = window._shopSaasData?.plan || 'none';
  const modalHtml = `
    <div id="shop-upgrade-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="background:#1a2029;border:1px solid rgba(201,162,39,0.3);border-radius:20px;max-width:580px;width:100%;padding:32px;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <h3 style="font-family:'Playfair Display',serif;font-size:1.4rem;">Shop Subscription Plans</h3>
          <button onclick="document.getElementById('shop-upgrade-modal').remove()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:1.4rem;line-height:1;">&times;</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:24px;">
          ${[
            { key: 'starter', name: 'Solo', price: '$49', desc: '1 technician', color: '#6b7280' },
            { key: 'pro', name: 'Team', price: '$99', desc: 'Up to 5 techs', color: '#c9a227', popular: true },
            { key: 'business', name: 'Shop', price: '$199', desc: 'Unlimited techs', color: '#22d3ee' }
          ].map(p => `
            <div style="background:${p.popular ? 'rgba(201,162,39,0.12)' : 'rgba(30,38,48,0.8)'};border:1px solid ${p.popular ? 'rgba(201,162,39,0.4)' : 'rgba(160,168,184,0.15)'};border-radius:14px;padding:20px;text-align:center;">
              ${p.popular ? '<div style="font-size:0.7rem;font-weight:700;color:#c9a227;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Most Popular</div>' : ''}
              <div style="font-weight:700;font-size:1rem;margin-bottom:6px;">${p.name}</div>
              <div style="font-size:1.6rem;font-weight:700;color:${p.color};margin-bottom:4px;">${p.price}<span style="font-size:0.8rem;color:#6b7280;font-weight:400;">/mo</span></div>
              <div style="font-size:0.8rem;color:#a0a8b8;margin-bottom:16px;">${p.desc}</div>
              ${plan === p.key ? '<div style="font-size:0.8rem;color:#34d399;font-weight:600;">✓ Current Plan</div>' : `<button onclick="selectShopPlan('${p.key}')" style="width:100%;padding:9px;background:${p.popular ? 'linear-gradient(135deg,#c9a227,#e8bc5a)' : 'transparent'};color:${p.popular ? '#12161c' : '#f5f5f7'};border:1px solid ${p.popular ? 'transparent' : 'rgba(160,168,184,0.3)'};border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">Select ${p.name}</button>`}
            </div>
          `).join('')}
        </div>
        <p style="font-size:0.82rem;color:#6b7280;text-align:center;">All plans include a 14-day free trial. Cancel anytime. Billed monthly.</p>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function selectShopPlan(planKey) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/saas/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ product: 'shop', plan: planKey })
    });
    const data = await res.json();
    document.getElementById('shop-upgrade-modal')?.remove();
    if (data.url) {
      window.location.href = data.url;
    } else {
      if (typeof showToast === 'function') showToast(data.error || 'Subscription failed. Please contact support.', 'error');
    }
  } catch (err) {
    console.error('[ShopPlan] Error:', err);
  }
}

// Marketplace visibility toggle
async function loadMarketplaceVisibility() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/provider/marketplace-visibility`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    const toggle = document.getElementById('marketplace-visible-toggle');
    const shopOnlyToggle = document.getElementById('shop-only-mode-toggle');
    const statusText = document.getElementById('marketplace-status-text');
    if (toggle) toggle.checked = data.marketplace_visible !== false;
    if (shopOnlyToggle) shopOnlyToggle.checked = data.shop_only_mode === true;
    if (statusText) statusText.textContent = data.marketplace_visible !== false ? 'Visible in marketplace' : 'Hidden from marketplace';
  } catch (err) {
    console.error('[Marketplace Visibility] Load error:', err);
  }
}

async function saveMarketplaceVisibility() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const toggle = document.getElementById('marketplace-visible-toggle');
    const shopOnlyToggle = document.getElementById('shop-only-mode-toggle');
    const statusText = document.getElementById('marketplace-status-text');
    const visible = toggle ? toggle.checked : true;
    const shopOnly = shopOnlyToggle ? shopOnlyToggle.checked : false;

    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    await fetch(`${apiBase}/api/provider/marketplace-visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ marketplace_visible: visible, shop_only_mode: shopOnly })
    });
    if (statusText) statusText.textContent = visible ? 'Visible in marketplace' : 'Hidden from marketplace';
    if (typeof showToast === 'function') showToast('Marketplace visibility updated', 'success');
  } catch (err) {
    console.error('[Marketplace Visibility] Save error:', err);
  }
}

// Walk-in customer kiosk lookup
async function walkinLookupByPhone() {
  const phoneInput = document.getElementById('walkin-phone-input');
  const resultArea = document.getElementById('walkin-lookup-result');
  if (!phoneInput || !resultArea) return;
  const phone = phoneInput.value.trim();
  if (!phone) return;

  resultArea.innerHTML = '<span style="color:#6b7280;font-size:0.9rem;">Looking up…</span>';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/shop/walkin-lookup?phone=${encodeURIComponent(phone)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();

    const renderCustomerCard = (c) => {
      const vehicles = c.vehicles || [];
      return `<div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:16px;margin-top:12px;">
        <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${escHtml(c.name || 'Returning Customer')} <span style="font-size:0.78rem;font-weight:400;color:#6b7280;">· ${Number(c.visit_count || 1)} visit${c.visit_count !== 1 ? 's' : ''}</span></div>
        ${c.email ? `<div style="font-size:0.85rem;color:#a0a8b8;">${escHtml(c.email)}</div>` : ''}
        ${vehicles.length > 0 ? `<div style="font-size:0.85rem;color:#a0a8b8;margin-top:8px;">Vehicles: ${vehicles.slice(0,3).map(v => escHtml(v.description)).join(', ')}</div>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button onclick="walkinAutoFill(${JSON.stringify(c).replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/"/g,'&quot;')})" style="padding:7px 14px;background:linear-gradient(135deg,#c9a227,#e8bc5a);color:#12161c;border:none;border-radius:8px;cursor:pointer;font-size:0.83rem;font-weight:600;">Auto-Fill Check-In</button>
        </div>
      </div>`;
    };

    if (data.found && data.customer) {
      if (data.results && data.results.length > 1) {
        resultArea.innerHTML = data.results.map(renderCustomerCard).join('');
      } else {
        resultArea.innerHTML = renderCustomerCard(data.customer);
      }
    } else {
      resultArea.innerHTML = '<div style="font-size:0.88rem;color:#6b7280;margin-top:8px;">New customer — no previous visits found.</div>';
    }
  } catch (err) {
    resultArea.innerHTML = '<div style="font-size:0.88rem;color:#f87171;margin-top:8px;">Lookup failed. Please try again.</div>';
  }
}

async function walkinLookupByName() {
  const nameInput = document.getElementById('walkin-name-search-input');
  const resultArea = document.getElementById('walkin-lookup-result');
  if (!nameInput || !resultArea) return;
  const name = nameInput.value.trim();
  if (!name) return;

  resultArea.innerHTML = '<span style="color:#6b7280;font-size:0.9rem;">Looking up…</span>';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/shop/walkin-lookup?name=${encodeURIComponent(name)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();

    const renderCustomerCard = (c) => {
      const vehicles = c.vehicles || [];
      return `<div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:16px;margin-top:12px;">
        <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${escHtml(c.name || 'Returning Customer')} <span style="font-size:0.78rem;font-weight:400;color:#6b7280;">· ${Number(c.visit_count || 1)} visit${c.visit_count !== 1 ? 's' : ''}</span></div>
        ${c.phone ? `<div style="font-size:0.85rem;color:#a0a8b8;">${escHtml(c.phone)}</div>` : ''}
        ${vehicles.length > 0 ? `<div style="font-size:0.85rem;color:#a0a8b8;margin-top:8px;">Vehicles: ${vehicles.slice(0,3).map(v => escHtml(v.description)).join(', ')}</div>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button onclick="walkinAutoFill(${JSON.stringify(c).replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/"/g,'&quot;')})" style="padding:7px 14px;background:linear-gradient(135deg,#c9a227,#e8bc5a);color:#12161c;border:none;border-radius:8px;cursor:pointer;font-size:0.83rem;font-weight:600;">Auto-Fill Check-In</button>
        </div>
      </div>`;
    };

    if (data.found && (data.results?.length || data.customer)) {
      const customers = data.results || [data.customer];
      resultArea.innerHTML = customers.map(renderCustomerCard).join('');
    } else {
      resultArea.innerHTML = '<div style="font-size:0.88rem;color:#6b7280;margin-top:8px;">No customers found with that name.</div>';
    }
  } catch (err) {
    resultArea.innerHTML = '<div style="font-size:0.88rem;color:#f87171;margin-top:8px;">Lookup failed. Please try again.</div>';
  }
}

function walkinAutoFill(customer) {
  const nameField = document.getElementById('walkin-name-field');
  const vehicleField = document.getElementById('walkin-vehicle-field');
  if (nameField && customer.name) nameField.value = customer.name;
  if (vehicleField && customer.vehicles?.[0]) vehicleField.value = customer.vehicles[0].description;
  if (typeof showToast === 'function') showToast('Customer details pre-filled', 'success');
}

async function saveWalkinCustomer(phone, name, vehicle, email) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    await fetch(`${apiBase}/api/shop/walkin-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ phone, name, vehicle, email })
    });
  } catch (err) {
    console.error('[Walkin] Save error:', err);
  }
}

// Shop onboarding checklist
async function loadShopOnboardingChecklist() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/shop/onboarding-status`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    renderShopOnboardingChecklist(data.steps || {});
  } catch (err) {
    console.error('[Onboarding] Load error:', err);
  }
}

function renderShopOnboardingChecklist(steps) {
  const container = document.getElementById('shop-onboarding-checklist');
  if (!container) return;

  const items = [
    { key: 'profile_complete', label: 'Complete your business profile (name & phone)', action: "showSection('profile')", actionLabel: 'Go to Profile' },
    { key: 'stripe_connected', label: 'Connect Stripe to receive payments', action: "showSection('payments')", actionLabel: 'Connect Stripe' },
    { key: 'first_team_member', label: 'Add your first team member', action: "showSection('team')", actionLabel: 'Add Team Member' },
    { key: 'first_service', label: 'Complete your first service job', action: "showSection('jobs')", actionLabel: 'View Jobs' },
    { key: 'subscription_active', label: 'Activate your shop subscription', action: 'openShopUpgradeModal()', actionLabel: 'View Plans' }
  ];

  const completed = items.filter(i => steps[i.key]).length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);

  container.innerHTML = `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:0.85rem;font-weight:600;">Setup Progress</span>
        <span style="font-size:0.82rem;color:#6b7280;">${completed}/${total} complete</span>
      </div>
      <div style="height:6px;background:rgba(160,168,184,0.15);border-radius:3px;">
        <!-- RTL note (Task #410): 90deg gradient is cosmetic on a width-driven progress bar (intentionally physical). Follow-up #506. -->
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#c9a227,#e8bc5a);border-radius:3px;transition:width 0.4s;"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${items.map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${steps[item.key] ? 'rgba(52,211,153,0.06)' : 'rgba(30,38,48,0.6)'};border:1px solid ${steps[item.key] ? 'rgba(52,211,153,0.2)' : 'rgba(160,168,184,0.12)'};border-radius:10px;">
          <span style="font-size:1rem;flex-shrink:0;">${steps[item.key] ? '✅' : '⬜'}</span>
          <span style="font-size:0.88rem;flex:1;color:${steps[item.key] ? '#a0a8b8' : '#f5f5f7'};${steps[item.key] ? 'text-decoration:line-through;' : ''}">${item.label}</span>
          ${!steps[item.key] && item.action ? `<button onclick="${item.action}" style="padding:4px 10px;background:transparent;border:1px solid rgba(201,162,39,0.4);color:#c9a227;border-radius:6px;cursor:pointer;font-size:0.75rem;white-space:nowrap;">${item.actionLabel}</button>` : ''}
        </div>
      `).join('')}
    </div>
    ${pct === 100 ? '<div style="margin-top:12px;padding:10px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);border-radius:10px;text-align:center;font-size:0.88rem;color:#34d399;font-weight:600;">🎉 Setup complete! Your shop is ready.</div>' : ''}
  `;

  // Hide checklist entirely if dismissed
  const wrapper = document.getElementById('shop-onboarding-card');
  if (wrapper && pct === 100) {
    setTimeout(() => { wrapper.style.display = 'none'; }, 3000);
  }
}

console.log('providers-settings.js shop extensions loaded');
// ========== END PROVIDER SHOP SAAS ==========

// ========== POS KIOSK CUSTOMER LOOKUP WITH WALKIN HISTORY ==========
async function posLookupCustomer() {
  const phoneEl = document.getElementById('pos-phone');
  const phone = phoneEl ? phoneEl.value.replace(/\D/g, '') : '';
  if (!phone || phone.length < 7) {
    if (typeof showToast === 'function') showToast('Please enter a valid phone number', 'error');
    return;
  }

  const lookupBtn = document.getElementById('pos-lookup-btn');
  if (lookupBtn) { lookupBtn.disabled = true; lookupBtn.textContent = 'Looking up…'; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const res = await fetch(`${apiBase}/api/shop/walkin-lookup?phone=${encodeURIComponent(phone)}`, {
      headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
    });
    const data = await res.json();

    // Move to step 2 - verify/info step
    if (typeof posGoToStep === 'function') posGoToStep(2);

    const existingSection = document.getElementById('pos-existing-customer-section');
    const newSection = document.getElementById('pos-customer-info-section');
    const otpSection = document.getElementById('pos-otp-section');

    if (data.found && data.customer) {
      // Returning customer — autofill from walkin history
      if (existingSection) existingSection.style.display = 'block';
      if (newSection) newSection.style.display = 'none';
      if (otpSection) otpSection.style.display = 'none';

      const nameEl = document.getElementById('pos-existing-name');
      const emailEl = document.getElementById('pos-existing-email');
      const lastVehicle = data.customer.vehicles?.[0]?.description || data.customer.vehicle || null;
      if (nameEl) nameEl.textContent = `Welcome back, ${data.customer.name || 'Valued Customer'}!`;
      if (emailEl) emailEl.textContent = lastVehicle ? `Last vehicle: ${lastVehicle}` : (data.customer.email || '');

      // Also seed name/vehicle fields in case we proceed to new service
      const nameInput = document.getElementById('pos-customer-name');
      const emailInput = document.getElementById('pos-customer-email');
      if (nameInput && data.customer.name) nameInput.value = data.customer.name;
      if (emailInput && data.customer.email) emailInput.value = data.customer.email;

      // Pre-fill vehicle step if vehicle info is known
      const vehicleInput = document.getElementById('pos-vehicle-info') || document.getElementById('pos-vehicle');
      if (vehicleInput && lastVehicle) vehicleInput.value = lastVehicle;

      if (typeof showToast === 'function') showToast(`Returning customer found! Visit #${data.customer.visit_count || 1}`, 'success');
    } else {
      // New customer — show new customer form
      if (existingSection) existingSection.style.display = 'none';
      if (newSection) newSection.style.display = 'block';
      if (otpSection) otpSection.style.display = 'none';

      const nameInput = document.getElementById('pos-customer-name');
      const emailInput = document.getElementById('pos-customer-email');
      if (nameInput) nameInput.value = '';
      if (emailInput) emailInput.value = '';
    }
  } catch (err) {
    console.error('[POS lookup] error:', err);
    if (typeof showToast === 'function') showToast('Lookup failed, proceed manually', 'error');
    // Still advance to step 2 even on error
    if (typeof posGoToStep === 'function') posGoToStep(2);
  } finally {
    if (lookupBtn) { lookupBtn.disabled = false; lookupBtn.textContent = 'Look Up by Phone'; }
  }
}
// ========== END POS KIOSK CUSTOMER LOOKUP ==========

// ========== BUSINESS HOURS EDITOR ==========
const BUSINESS_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' };

async function loadBusinessHours() {
  const editor = document.getElementById('business-hours-editor');
  if (!editor) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('business_hours')
    .eq('id', session.user.id)
    .single();

  const savedHours = profile?.business_hours || {};

  editor.innerHTML = BUSINESS_DAYS.map(day => {
    const h = savedHours[day] || { open: '09:00', close: '17:00', closed: false };
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
      <div style="width:100px;font-size:0.88rem;font-weight:600;">${DAY_LABELS[day]}</div>
      <input type="checkbox" id="hours-closed-${day}" ${h.closed ? 'checked' : ''} onchange="toggleDayClosed('${day}')" style="width:16px;height:16px;accent-color:var(--accent-gold);" title="Closed">
      <label for="hours-closed-${day}" style="font-size:0.82rem;color:var(--text-muted);margin-inline-end:8px;">Closed</label>
      <div id="hours-time-${day}" style="display:flex;align-items:center;gap:8px;${h.closed ? 'opacity:0.3;pointer-events:none;' : ''}">
        <input type="time" id="hours-open-${day}" value="${h.open || '09:00'}" class="form-input" style="padding:6px 8px;font-size:0.85rem;width:120px;">
        <span style="color:var(--text-muted);font-size:0.85rem;">–</span>
        <input type="time" id="hours-close-${day}" value="${h.close || '17:00'}" class="form-input" style="padding:6px 8px;font-size:0.85rem;width:120px;">
      </div>
    </div>`;
  }).join('');
}

function toggleDayClosed(day) {
  const closed = document.getElementById(`hours-closed-${day}`)?.checked;
  const timeRow = document.getElementById(`hours-time-${day}`);
  if (timeRow) {
    timeRow.style.opacity = closed ? '0.3' : '1';
    timeRow.style.pointerEvents = closed ? 'none' : 'auto';
  }
}

async function saveBusinessHours() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { showToast('Please sign in first', 'error'); return; }

  const hours = {};
  BUSINESS_DAYS.forEach(day => {
    const closed = document.getElementById(`hours-closed-${day}`)?.checked || false;
    const open = document.getElementById(`hours-open-${day}`)?.value || '09:00';
    const close = document.getElementById(`hours-close-${day}`)?.value || '17:00';
    hours[day] = { open, close, closed };
  });

  const { error } = await supabaseClient
    .from('profiles')
    .update({ business_hours: hours })
    .eq('id', session.user.id);

  if (error) {
    showToast('Failed to save hours: ' + error.message, 'error');
  } else {
    showToast('Business hours saved!', 'success');
  }
}
// ========== END BUSINESS HOURS EDITOR ==========

// ========== AUTO-BID SETTINGS ==========
async function loadAutoBidSettings() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  try {
    const res = await fetch('/api/auto-bid/settings', {
      headers: { 'Authorization': 'Bearer ' + (await supabaseClient.auth.getSession()).data.session?.access_token }
    });
    if (!res.ok) return;
    const d = await res.json();
    const enabled = d.auto_bid_enabled || false;
    const toggle = document.getElementById('auto-bid-toggle');
    const slider = document.getElementById('auto-bid-slider');
    const thumb = document.getElementById('auto-bid-thumb');
    const label = document.getElementById('auto-bid-status-label');
    if (toggle) toggle.checked = enabled;
    applyAutoBidToggleStyle(enabled, slider, thumb, label);
    const dist = document.getElementById('ab-max-distance');
    if (dist) dist.value = d.auto_bid_max_distance_miles || 25;
    const pct = document.getElementById('ab-pct');
    if (pct) {
      pct.value = d.auto_bid_percent_of_estimate || 85;
      const pctLabel = document.getElementById('ab-pct-label');
      if (pctLabel) pctLabel.textContent = (d.auto_bid_percent_of_estimate || 85) + '%';
    }
    const types = d.auto_bid_service_types || [];
    document.querySelectorAll('.ab-svc-chip').forEach(chip => {
      chip.classList.toggle('active', types.includes(chip.dataset.type));
    });
    await updateAutoBidPreview();
  } catch (e) {
    console.error('Auto-bid load error', e);
  }
}

function applyAutoBidToggleStyle(on, slider, thumb, label) {
  if (!slider || !thumb || !label) {
    slider = document.getElementById('auto-bid-slider');
    thumb = document.getElementById('auto-bid-thumb');
    label = document.getElementById('auto-bid-status-label');
  }
  if (slider) slider.style.background = on ? 'var(--accent-gold)' : 'var(--bg-input)';
  if (slider) slider.style.borderColor = on ? 'var(--accent-gold)' : 'var(--border-subtle)';
  if (thumb) { thumb.style.insetInlineStart = on ? '24px' : '2px'; thumb.style.background = on ? 'var(--bg-deep)' : 'var(--text-muted)'; }
  if (label) { label.textContent = on ? 'Enabled' : 'Disabled'; label.style.color = on ? 'var(--accent-gold)' : 'var(--text-muted)'; }
}

function onAutoBidToggle(checked) {
  applyAutoBidToggleStyle(checked);
}

function toggleAbServiceType(el) {
  el.classList.toggle('active');
  updateAutoBidPreview();
}

async function updateAutoBidPreview() {
  const countEl = document.getElementById('ab-preview-count');
  if (!countEl) return;
  try {
    const dist = Number.parseInt(document.getElementById('ab-max-distance')?.value || 25);
    const selected = Array.from(document.querySelectorAll('.ab-svc-chip'))
      .filter(c => c.classList.contains('active')).map(c => c.dataset.type);
    const params = new URLSearchParams({ max_distance: dist });
    if (selected.length) params.set('service_types', selected.join(','));
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/care-plans/preview?' + params, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) { countEl.textContent = '—'; return; }
    const d = await res.json();
    const n10 = d.count_of_last_10 || 0;
    countEl.textContent = `${n10} of the last 10 plans posted match your settings`;
  } catch (e) {
    countEl.textContent = '—';
  }
}

async function saveAutoBidSettings() {
  try {
    const enabled = document.getElementById('auto-bid-toggle')?.checked || false;
    const dist = Number.parseInt(document.getElementById('ab-max-distance')?.value || 25);
    const pct = Number.parseInt(document.getElementById('ab-pct')?.value || 85);
    const selected = Array.from(document.querySelectorAll('.ab-svc-chip'))
      .filter(c => c.classList.contains('active')).map(c => c.dataset.type);
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/auto-bid/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        auto_bid_enabled: enabled,
        auto_bid_max_distance_miles: dist,
        auto_bid_percent_of_estimate: pct,
        auto_bid_service_types: selected
      })
    });
    if (!res.ok) throw new Error('Save failed');
    showToast('Auto-bid settings saved!', 'success');
  } catch (e) {
    showToast('Failed to save auto-bid settings: ' + e.message, 'error');
  }
}
// ========== END AUTO-BID SETTINGS ==========
