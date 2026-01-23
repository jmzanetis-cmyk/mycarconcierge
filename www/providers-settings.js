// ========== PROVIDERS SETTINGS MODULE ==========
// Profile, team management, verification, notifications, referrals

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
    hourly_rate: parseFloat(document.getElementById('profile-hourly-rate')?.value) || null
  };
  
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update(fields)
      .eq('id', currentUser.id);
    
    if (error) throw error;
    
    providerProfile = { ...providerProfile, ...fields };
    showToast('Profile saved!', 'success');
    
    const displayName = fields.business_name || providerProfile.full_name || 'Provider';
    document.getElementById('user-name').textContent = displayName;
    
  } catch (err) {
    console.error('Save profile error:', err);
    showToast('Failed to save profile', 'error');
  }
}

async function saveEmergencySettings() {
  const enabled = document.getElementById('emergency-accept-calls')?.checked;
  const radius = parseInt(document.getElementById('emergency-radius')?.value) || 15;
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
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No team members yet. Invite your first team member!</p></div>';
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
  
  try {
    const { error } = await supabaseClient.from('team_invites').insert({
      provider_id: currentUser.id,
      email,
      role,
      status: 'pending'
    });
    
    if (error) throw error;
    
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
async function loadBackgroundCheckStatus() {
  const container = document.getElementById('bg-check-status-container');
  if (!container) return;

  try {
    const response = await fetch(`/api/background-check-status?provider_id=${currentUser.id}`);
    if (!response.ok) throw new Error('Failed to fetch status');
    const data = await response.json();

    if (!data.checks || data.checks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--text-muted);">
          <div style="font-size:2rem;margin-bottom:12px;">📋</div>
          <p>No background checks on file</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.checks.map(check => {
      const statusColors = {
        'pending': 'var(--accent-gold)',
        'clear': 'var(--accent-green)',
        'consider': 'var(--accent-orange)',
        'suspended': 'var(--accent-red)'
      };
      const statusIcons = {
        'pending': '⏳',
        'clear': '✅',
        'consider': '⚠️',
        'suspended': '🚫'
      };

      return `
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;border-left:3px solid ${statusColors[check.status] || 'var(--text-muted)'};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;">${statusIcons[check.status] || '📋'} ${check.subject_type === 'employee' ? 'Employee Check' : 'Provider Check'}</div>
            <span style="color:${statusColors[check.status]};text-transform:uppercase;font-size:0.85rem;">${check.status}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">
            Initiated: ${new Date(check.created_at).toLocaleDateString()}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading background check status:', err);
  }
}

function openBackgroundCheckModal() {
  document.getElementById('bg-check-type').value = 'provider';
  document.getElementById('bg-check-email').value = currentUser?.email || '';
  
  const employeeFields = document.getElementById('bg-check-employee-fields');
  if (employeeFields) employeeFields.style.display = 'none';
  
  openModal('background-check-modal');
}

function updateBgCheckForm() {
  const type = document.getElementById('bg-check-type')?.value;
  const employeeFields = document.getElementById('bg-check-employee-fields');
  const emailInput = document.getElementById('bg-check-email');
  
  if (type === 'employee') {
    if (employeeFields) employeeFields.style.display = 'block';
    if (emailInput) emailInput.value = '';
  } else {
    if (employeeFields) employeeFields.style.display = 'none';
    if (emailInput) emailInput.value = currentUser?.email || '';
  }
}

async function submitBackgroundCheck() {
  const type = document.getElementById('bg-check-type')?.value;
  const email = document.getElementById('bg-check-email')?.value?.trim();
  const teamMemberId = document.getElementById('bg-check-team-member')?.value;

  if (!email) {
    showToast('Please enter an email address', 'error');
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
    if (!response.ok) throw new Error(data.error || 'Failed to initiate');

    showToast('Background check initiated!', 'success');
    closeModal('background-check-modal');
    await loadBackgroundCheckStatus();
  } catch (err) {
    console.error('Background check error:', err);
    showToast(err.message, 'error');
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
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="copyLoyaltyLink()">📋 Copy Link</button>
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
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔗</div><p>No referrals yet. Share your QR code!</p></div>';
      return;
    }
    
    const statsEl = document.getElementById('loyalty-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="loyalty-qr-stat">
          <span class="loyalty-qr-stat-icon">👥</span>
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
      .select('*, referred:referred_id(business_name, full_name, email)')
      .eq('referrer_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤝</div><p>No provider referrals yet.</p></div>';
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

console.log('providers-settings.js loaded');
