    // ========== USER MANAGEMENT ==========
    let allUserManagementData = [];
    let filteredUserManagementData = [];
    let currentUserManagementFilter = 'all';
    let currentUserManagementSearch = '';
    let currentEditingUser = null;

    async function loadUserManagement() {
      try {
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) {
          console.error('Error loading profiles:', profilesError);
          return;
        }

        const { data: memberFounders, error: mfError } = await supabaseClient
          .from('member_founder_profiles')
          .select('*');

        const { data: referrals, error: refError } = await supabaseClient
          .from('founder_referrals')
          .select('founder_id');

        const { data: providerProfiles, error: ppError } = await supabaseClient
          .from('provider_profiles')
          .select('user_id, business_name');

        const referralCounts = {};
        if (referrals) {
          referrals.forEach(r => {
            referralCounts[r.founder_id] = (referralCounts[r.founder_id] || 0) + 1;
          });
        }

        const memberFounderMap = {};
        if (memberFounders) {
          memberFounders.forEach(mf => {
            if (mf.user_id) memberFounderMap[mf.user_id] = mf;
            if (mf.email) memberFounderMap[mf.email] = mf;
          });
        }

        const providerProfileMap = {};
        if (providerProfiles) {
          providerProfiles.forEach(pp => {
            if (pp.user_id) providerProfileMap[pp.user_id] = pp;
          });
        }

        allUserManagementData = profiles.map(p => {
          const memberFounder = memberFounderMap[p.id] || memberFounderMap[p.email];
          const providerProfile = providerProfileMap[p.id];
          const referralCount = memberFounder ? (referralCounts[memberFounder.id] || 0) : 0;
          
          return {
            ...p,
            memberFounderProfile: memberFounder || null,
            providerProfile: providerProfile || null,
            referralCount: referralCount,
            isFoundingMember: !!memberFounder,
            isFoundingProvider: p.is_founding_provider || false,
            isSuspended: !!(p.suspension_reason || p.suspended_at)
          };
        });

        updateUserManagementStats();
        filterUsersByRole(currentUserManagementFilter);
      } catch (err) {
        console.error('loadUserManagement error:', err);
      }
    }

    function updateUserManagementStats() {
      const total = allUserManagementData.length;
      const members = allUserManagementData.filter(u => u.role === 'member' || u.also_member).length;
      const providers = allUserManagementData.filter(u => u.role === 'provider' || u.also_provider).length;
      const founders = allUserManagementData.filter(u => u.isFoundingMember || u.isFoundingProvider).length;
      const suspended = allUserManagementData.filter(u => u.isSuspended).length;

      document.getElementById('um-total-users').textContent = total;
      document.getElementById('um-total-members').textContent = members;
      document.getElementById('um-total-providers').textContent = providers;
      document.getElementById('um-total-founders').textContent = founders;
      document.getElementById('um-suspended').textContent = suspended;
    }

    function searchUsers(query) {
      currentUserManagementSearch = query.toLowerCase().trim();
      renderUserManagementTable();
    }

    function filterUsersByRole(role) {
      currentUserManagementFilter = role;
      
      switch (role) {
        case 'all':
          filteredUserManagementData = [...allUserManagementData];
          break;
        case 'member':
          filteredUserManagementData = allUserManagementData.filter(u => u.role === 'member' || u.also_member);
          break;
        case 'provider':
          filteredUserManagementData = allUserManagementData.filter(u => u.role === 'provider' || u.also_provider);
          break;
        case 'founding-member':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingMember);
          break;
        case 'founding-provider':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingProvider);
          break;
        case 'provider-referrers':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingProvider && u.referralCount > 0);
          break;
        default:
          filteredUserManagementData = [...allUserManagementData];
      }
      
      renderUserManagementTable();
    }

    function renderUserManagementTable() {
      const tbody = document.getElementById('user-management-table');
      
      let displayData = filteredUserManagementData;
      
      if (currentUserManagementSearch) {
        displayData = displayData.filter(u => {
          const searchStr = `${u.full_name || ''} ${u.email || ''} ${u.phone || ''} ${u.business_name || ''}`.toLowerCase();
          return searchStr.includes(currentUserManagementSearch);
        });
      }

      if (!displayData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No users found</td></tr>`;
        return;
      }

      tbody.innerHTML = displayData.map(u => {
        const roleDisplay = getRoleDisplay(u);
        const founderStatus = getFounderStatus(u);
        const statusBadge = u.isSuspended ? 
          '<span class="status-badge rejected">Suspended</span>' : 
          '<span class="status-badge approved">Active</span>';
        
        return `
          <tr>
            <td>
              <div><strong>${u.full_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${u.email || 'No email'}</div>
              ${u.phone ? `<div style="font-size:0.75rem;color:var(--text-muted);">${u.phone}</div>` : ''}
            </td>
            <td>${roleDisplay}</td>
            <td>${founderStatus}</td>
            <td>${u.referralCount > 0 ? `<span style="color:var(--accent-gold);font-weight:600;">${u.referralCount}</span>` : '-'}</td>
            <td>${statusBadge}</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openUserEditModal('${u.id}')">${mccIcon('file-text', 16)} Edit</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getRoleDisplay(user) {
      const roles = [];
      if (user.role === 'member' || user.also_member) roles.push('Member');
      if (user.role === 'provider' || user.also_provider) roles.push('Provider');
      if (user.role === 'admin') roles.push('Admin');
      
      if (roles.length === 0) return '<span class="status-badge muted">Unknown</span>';
      if (roles.includes('Member') && roles.includes('Provider')) {
        return '<span class="status-badge blue">Both</span>';
      }
      if (roles.includes('Provider')) {
        return '<span class="status-badge provider">Provider</span>';
      }
      if (roles.includes('Member')) {
        return '<span class="status-badge member">Member</span>';
      }
      if (roles.includes('Admin')) {
        return '<span class="status-badge admin">Admin</span>';
      }
      return '<span class="status-badge muted">-</span>';
    }

    function getFounderStatus(user) {
      if (user.isFoundingMember && user.isFoundingProvider) {
        return `<span style="background:linear-gradient(135deg,#9b59b6,#8e44ad);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${mccIcon('award', 16)} Founding Partner</span>`;
      }
      
      const statuses = [];
      if (user.isFoundingMember) statuses.push('Member Founder');
      if (user.isFoundingProvider) statuses.push('Provider Founder');
      
      if (statuses.length === 0) return '<span class="status-badge muted">None</span>';
      return statuses.map(s => {
        if (s === 'Member Founder') {
          return `<span class="status-badge blue">${mccIcon('star', 16)} ${s}</span>`;
        }
        return `<span class="status-badge open">${mccIcon('star', 16)} ${s}</span>`;
      }).join(' ');
    }

    async function openUserEditModal(userId) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) {
        showToast('User not found', 'error');
        return;
      }

      currentEditingUser = user;
      
      const mfp = user.memberFounderProfile;
      const founderSection = mfp ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Member Founder Details</div>
          <div class="detail-grid">
            <span class="detail-label">Referral Code:</span>
            <span class="detail-value"><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${mfp.referral_code || 'N/A'}</code></span>
            <span class="detail-label">Tier:</span>
            <span class="detail-value">${mfp.tier || 'Standard'}</span>
            <span class="detail-label">Total Earnings:</span>
            <span class="detail-value" style="color:var(--accent-green);">$${Number.parseFloat(mfp.total_commissions_earned || 0).toFixed(2)}</span>
            <span class="detail-label">Pending Balance:</span>
            <span class="detail-value" style="color:var(--accent-gold);">$${Number.parseFloat(mfp.pending_balance || 0).toFixed(2)}</span>
            <span class="detail-label">Provider Referrals:</span>
            <span class="detail-value">${user.referralCount}</span>
            <span class="detail-label">Stripe Connect:</span>
            <span class="detail-value">${mfp.stripe_connect_account_id ? 
              (mfp.payout_details?.transfers_enabled ? '<span class="status-badge approved">' + mccIcon('credit-card', 16) + ' Connected</span>' : '<span class="status-badge orange">' + mccIcon('clock', 16) + ' Pending</span>') : 
              '<span class="status-badge muted">Not Setup</span>'}</span>
          </div>
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Payout Method</label>
            <select class="form-select" id="edit-payout-method">
              <option value="stripe_connect" ${mfp.payout_method === 'stripe_connect' ? 'selected' : ''}>Stripe Connect</option>
              <option value="paypal" ${mfp.payout_method === 'paypal' ? 'selected' : ''}>PayPal</option>
              <option value="bank_transfer" ${mfp.payout_method === 'bank_transfer' ? 'selected' : ''}>Bank Transfer</option>
              <option value="check" ${mfp.payout_method === 'check' ? 'selected' : ''}>Check</option>
            </select>
          </div>
        </div>
      ` : '';

      const providerFounderSection = user.isFoundingProvider ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('wrench', 24)} Provider Founder Status</div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
            <span style="font-size:24px;">${mccIcon('star', 24)}</span>
            <div>
              <div style="font-weight:600;color:var(--accent-gold);">Founding Provider</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">This provider is part of the founding program</div>
            </div>
          </div>
        </div>
      ` : '';

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Basic Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${user.full_name || 'Not set'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${user.email || 'Not set'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${user.phone || 'Not set'}</span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(user.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('refresh-cw', 24)} Role Management</div>
          <div style="margin-bottom:12px;">
            <span class="form-label">Current Role:</span>
            ${getRoleDisplay(user)}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn ${user.role === 'member' && !user.also_provider ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'member')">Make Member Only</button>
            <button class="btn ${user.role === 'provider' && !user.also_member ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'provider')">Make Provider Only</button>
            <button class="btn ${(user.also_member && user.also_provider) || (user.role === 'member' && user.also_provider) || (user.role === 'provider' && user.also_member) ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'both')">Make Both</button>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Founder Status</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="btn ${user.isFoundingMember ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'member')">
              ${user.isFoundingMember ? mccIcon('check', 16) + ' Member Founder' : 'Make Founding Member'}
            </button>
            <button class="btn ${user.isFoundingProvider ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'provider')">
              ${user.isFoundingProvider ? mccIcon('check', 16) + ' Provider Founder' : 'Make Founding Provider'}
            </button>
          </div>
        </div>

        ${founderSection}
        ${providerFounderSection}

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('settings', 24)} Account Actions</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${user.isSuspended ? `
              <button class="btn btn-success" onclick="toggleUserSuspension('${user.id}', false)">${mccIcon('check', 16)} Unsuspend Account</button>
              <div style="margin-top:8px;padding:12px;background:var(--accent-red-soft);border-radius:var(--radius-md);width:100%;">
                <div style="color:var(--accent-red);font-weight:600;">${mccIcon('x', 16)} Account Suspended</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">Reason: ${user.suspension_reason || 'Not specified'}</div>
                ${user.suspended_at ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Suspended on: ${new Date(user.suspended_at).toLocaleString()}</div>` : ''}
              </div>
            ` : `
              <button class="btn btn-danger" onclick="toggleUserSuspension('${user.id}', true)">${mccIcon('x', 16)} Suspend Account</button>
            `}
          </div>
        </div>
      `;

      document.getElementById('user-edit-modal-body').innerHTML = modalContent
        + `<div class="form-section" id="user-edit-outreach-history" style="border-bottom:none;"><div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div><div id="user-edit-outreach-history-body" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div></div>`;
      const userEditModal = document.getElementById('user-edit-modal');
      userEditModal.style.display = '';
      userEditModal.classList.add('active');
      if (typeof globalThis.renderOutreachHistoryPanel === 'function') {
        globalThis.renderOutreachHistoryPanel('user-edit-outreach-history-body', user.id);
      }
    }

    async function updateUserRole(userId, newRole) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      let updateData = {};
      
      switch (newRole) {
        case 'member':
          updateData = { role: 'member', also_provider: false, also_member: false };
          break;
        case 'provider':
          updateData = { role: 'provider', also_member: false, also_provider: false };
          break;
        case 'both':
          if (user.role === 'member') {
            updateData = { also_provider: true };
          } else if (user.role === 'provider') {
            updateData = { also_member: true };
          } else {
            updateData = { role: 'member', also_provider: true };
          }
          break;
      }

      // Task #240: role flips now route through an audited Netlify endpoint.
      // The browser used to call supabaseClient.from('profiles').update(...)
      // directly, which relied on the "Admins can update any profile" RLS
      // policy that is being removed.
      try {
        const res = await fetch('/api/admin/provider-actions/update-user-role', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            ...updateData,
            actor_id: currentUser?.id || null
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast('Failed to update role: ' + (json.error || res.status), 'error');
          return;
        }
      } catch (e) {
        showToast('Failed to update role: ' + e.message, 'error');
        return;
      }

      showToast('Role updated successfully', 'success');
      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function toggleFounderStatus(userId, founderType) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      if (founderType === 'member') {
        if (user.isFoundingMember) {
          if (!confirm('Remove founding member status? This will not delete their referral history.')) return;
          
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .update({ status: 'inactive' })
            .eq('user_id', userId);

          if (error) {
            showToast('Failed to update founder status: ' + error.message, 'error');
            return;
          }
          showToast('Founding member status removed', 'success');
        } else {
          let founderName = user.full_name;
          if (!founderName || founderName.trim() === '') {
            founderName = prompt('This user has no name set. Enter a name for the founder profile:', user.email?.split('@')[0] || 'User');
            if (!founderName || founderName.trim() === '') {
              showToast('A name is required to create a founder profile', 'error');
              return;
            }
          }
          
          const referralCode = generateReferralCode(founderName);
          
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .insert({
              user_id: userId,
              full_name: founderName,
              email: user.email,
              phone: user.phone,
              referral_code: referralCode,
              status: 'active'
            });

          if (error) {
            if (error.code === '23505') {
              const { error: updateError } = await supabaseClient
                .from('member_founder_profiles')
                .update({ status: 'active' })
                .eq('user_id', userId);
              
              if (updateError) {
                showToast('Failed to reactivate founder status: ' + updateError.message, 'error');
                return;
              }
            } else {
              showToast('Failed to create founder profile: ' + error.message, 'error');
              return;
            }
          }
          showToast(`User is now a Founding Member! Code: ${referralCode}`, 'success');
        }
      } else if (founderType === 'provider') {
        const newStatus = !user.isFoundingProvider;

        // Task #240: routed through audited server endpoint so the broad
        // "Admins can update any profile" RLS policy can be dropped.
        try {
          const res = await fetch('/api/admin/provider-actions/update-user-role', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, is_founding_provider: newStatus, actor_id: currentUser?.id || null })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast('Failed to update founding provider status: ' + (json.error || res.status), 'error');
            return;
          }
        } catch (e) {
          showToast('Failed to update founding provider status: ' + e.message, 'error');
          return;
        }
        showToast(newStatus ? 'User is now a Founding Provider!' : 'Founding provider status removed', 'success');
      }

      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function toggleUserSuspension(userId, suspend) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      // Task #127 — both branches now route through admin-password-gated
      // server endpoints so the actions are validated, rate-limited, and
      // audited (and Gatekeeper triggers fire when role changes).
      if (suspend) {
        const reason = prompt('Enter suspension reason (5-500 chars):');
        if (!reason || reason.trim().length < 5) {
          showToast('Suspension reason must be at least 5 characters.', 'error');
          return;
        }
        try {
          const res = await fetch('/api/admin/provider/suspend', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider_id: userId, reason: reason.trim() })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(json.error || `Failed to suspend user (${res.status})`, 'error');
            return;
          }
          showToast('User suspended', 'success');
        } catch (e) {
          showToast('Failed to suspend user: ' + e.message, 'error');
          return;
        }
      } else {
        if (!confirm('Unsuspend this user?')) return;
        try {
          const res = await fetch('/api/admin/provider/activate', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider_id: userId })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(json.error || `Failed to unsuspend user (${res.status})`, 'error');
            return;
          }
          showToast('User unsuspended', 'success');
        } catch (e) {
          showToast('Failed to unsuspend user: ' + e.message, 'error');
          return;
        }
      }

      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function saveUserChanges() {
      if (!currentEditingUser) return;

      const mfp = currentEditingUser.memberFounderProfile;
      if (mfp) {
        const payoutMethod = document.getElementById('edit-payout-method')?.value;
        if (payoutMethod && payoutMethod !== mfp.payout_method) {
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .update({ payout_method: payoutMethod })
            .eq('id', mfp.id);

          if (error) {
            showToast('Failed to update payout method: ' + error.message, 'error');
            return;
          }
        }
      }

      showToast('Changes saved successfully', 'success');
      closeModal('user-edit-modal');
      await loadUserManagement();
    }

    async function refreshUserManagement() {
      showToast('Refreshing user data...', 'info');
      await loadUserManagement();
      showToast('User data refreshed', 'success');
    }

    // Setup user management tabs
    document.getElementById('user-management-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#user-management-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filterUsersByRole(e.target.dataset.filter);
      }
    });

    // ========== CAR (CORRECTIVE ACTION RESPONSE) MANAGEMENT ==========
    let allCARs = [];
    let currentCAR = null;
    let currentCARFilter = 'pending';

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

    function getComplaintLabel(code) {
      return COMPLAINT_REASON_LABELS[code] || code || 'Unknown';
    }

    function getCARStatusBadgeClass(status) {
      switch(status) {
        case 'pending': return 'pending';
        case 'under_review': return 'blue';
        case 'approved': return 'approved';
        case 'rejected': return 'rejected';
        case 'revision_requested': return 'orange';
        default: return 'muted';
      }
    }

    function getCARStatusLabel(status) {
      switch(status) {
        case 'pending': return 'Pending';
        case 'under_review': return 'Under Review';
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'revision_requested': return 'Revision Requested';
        default: return status || 'Unknown';
      }
    }

    async function loadPendingCARs() {
      try {
        const { data, error } = await supabaseClient
          .from('corrective_action_responses')
          .select(`
            *,
            provider:provider_id(id, full_name, business_name, email, suspended_at),
            provider_stats:provider_id(average_rating, total_reviews, suspended, suspended_at, primary_complaint_reason, complaint_counts)
          `)
          .order('submitted_at', { ascending: false });
        
        if (error) {
          console.error('Error loading CARs:', error);
          allCARs = [];
        } else {
          allCARs = data || [];
        }
        
        updateCARStats();
        renderCARs();
        
        const pendingCount = allCARs.filter(c => c.status === 'pending' || c.status === 'under_review').length;
        document.getElementById('car-count').textContent = pendingCount;
      } catch (err) {
        console.error('loadPendingCARs error:', err);
        allCARs = [];
        renderCARs();
      }
    }

    function updateCARStats() {
      document.getElementById('car-pending').textContent = allCARs.filter(c => c.status === 'pending').length;
      document.getElementById('car-under-review').textContent = allCARs.filter(c => c.status === 'under_review').length;
      document.getElementById('car-approved').textContent = allCARs.filter(c => c.status === 'approved').length;
      document.getElementById('car-rejected').textContent = allCARs.filter(c => c.status === 'rejected').length;
    }

    function filterCARs(filter) {
      currentCARFilter = filter;
      renderCARs();
    }

    function renderCARs() {
      const tbody = document.getElementById('car-table');
      let filtered = allCARs;
      
      if (currentCARFilter !== 'all') {
        filtered = allCARs.filter(c => c.status === currentCARFilter);
      }
      
      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No CAR submissions ${currentCARFilter !== 'all' ? 'with status "' + getCARStatusLabel(currentCARFilter) + '"' : ''}</td></tr>`;
        return;
      }
      
      tbody.innerHTML = filtered.map(car => {
        const provider = car.provider;
        const providerName = provider?.business_name || provider?.full_name || 'Unknown Provider';
        const complaintLabel = getComplaintLabel(car.primary_complaint_reason);
        const statusClass = getCARStatusBadgeClass(car.status);
        const statusLabel = getCARStatusLabel(car.status);
        
        return `
          <tr>
            <td>
              <strong>${providerName}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted);">${provider?.email || ''}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">ID: ${car.provider_id?.substring(0,8)}...</div>
            </td>
            <td>${new Date(car.submitted_at).toLocaleDateString()}</td>
            <td>
              <span style="background:var(--accent-red-soft);color:var(--accent-red);padding:4px 10px;border-radius:100px;font-size:0.8rem;">
                ${complaintLabel}
              </span>
            </td>
            <td style="text-align:center;font-weight:600;">${car.complaint_count || 1}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="viewCAR('${car.id}')">Review</button></td>
          </tr>
        `;
      }).join('');
    }

    async function viewCAR(carId) {
      currentCAR = allCARs.find(c => c.id === carId);
      if (!currentCAR) {
        showToast('CAR not found', 'error');
        return;
      }
      
      const car = currentCAR;
      const provider = car.provider;
      const providerStats = Array.isArray(car.provider_stats) ? car.provider_stats[0] : car.provider_stats;
      const providerName = provider?.business_name || provider?.full_name || 'Unknown Provider';
      const complaintLabel = getComplaintLabel(car.primary_complaint_reason);
      const statusClass = getCARStatusBadgeClass(car.status);
      const statusLabel = getCARStatusLabel(car.status);
      
      const suspendedDate = provider?.suspended_at || providerStats?.suspended_at;
      const avgRating = providerStats?.average_rating;
      const totalReviews = providerStats?.total_reviews;
      
      const isReviewed = car.status === 'approved' || car.status === 'rejected';
      
      const modalBody = document.getElementById('car-modal-body');
      modalBody.innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Provider Information</div>
          <div class="detail-grid">
            <span class="detail-label">Provider Name:</span>
            <span class="detail-value"><strong>${providerName}</strong></span>
            <span class="detail-label">Email:</span>
            <span class="detail-value">${provider?.email || 'N/A'}</span>
            <span class="detail-label">Provider ID:</span>
            <span class="detail-value" style="font-family:monospace;font-size:0.85rem;">${car.provider_id}</span>
            <span class="detail-label">Suspended Date:</span>
            <span class="detail-value">${suspendedDate ? new Date(suspendedDate).toLocaleString() : 'N/A'}</span>
            <span class="detail-label">Average Rating:</span>
            <span class="detail-value">${avgRating ? avgRating.toFixed(1) + ' ' + mccIcon('star', 16) : 'N/A'} (${totalReviews || 0} reviews)</span>
            <span class="detail-label">CAR Status:</span>
            <span class="detail-value"><span class="status-badge ${statusClass}">${statusLabel}</span></span>
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('alert-triangle', 24)} Complaint Information</div>
          <div class="detail-grid">
            <span class="detail-label">Primary Complaint:</span>
            <span class="detail-value">
              <span style="background:var(--accent-red-soft);color:var(--accent-red);padding:4px 12px;border-radius:100px;font-size:0.9rem;font-weight:500;">
                ${complaintLabel}
              </span>
            </span>
            <span class="detail-label">Complaint Count:</span>
            <span class="detail-value" style="font-weight:600;font-size:1.1rem;">${car.complaint_count || 1}</span>
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${new Date(car.submitted_at).toLocaleString()}</span>
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('search', 24)} Root Cause Analysis</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.root_cause_analysis || 'No root cause analysis provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('check-circle', 24)} Corrective Action Plan</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.corrective_action_plan || 'No corrective action plan provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('shield', 24)} Preventative Action</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.preventative_action || 'No preventative action provided.'}
          </div>
        </div>
        
        ${car.additional_notes ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('file-text', 24)} Additional Notes from Provider</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.additional_notes}
          </div>
        </div>
        ` : ''}
        
        ${car.reviewed_at ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Review Information</div>
          <div class="detail-grid">
            <span class="detail-label">Reviewed At:</span>
            <span class="detail-value">${new Date(car.reviewed_at).toLocaleString()}</span>
            ${car.admin_notes ? `
            <span class="detail-label">Admin Notes:</span>
            <span class="detail-value">${car.admin_notes}</span>
            ` : ''}
            ${car.rejection_reason ? `
            <span class="detail-label">Rejection Reason:</span>
            <span class="detail-value" style="color:var(--accent-red);">${car.rejection_reason}</span>
            ` : ''}
          </div>
        </div>
        ` : `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Admin Notes</div>
          <textarea class="form-textarea" id="car-admin-notes" placeholder="Add internal notes about this CAR review (optional)..." rows="3"></textarea>
        </div>
        
        <div class="form-section" id="car-rejection-section" style="display:none;border-bottom:none;">
          <div class="form-section-title" style="color:var(--accent-red);">${mccIcon('x', 24)} Rejection Reason</div>
          <textarea class="form-textarea" id="car-rejection-reason" placeholder="Explain why this CAR is being rejected..." rows="3"></textarea>
        </div>
        `}
      `;
      
      const footer = document.getElementById('car-modal-footer');
      if (isReviewed) {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('car-modal')">Close</button>
        `;
      } else {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('car-modal')">Close</button>
          <button class="btn btn-danger" onclick="showCARRejectionForm()">Reject</button>
          <button class="btn" style="background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid var(--accent-orange);" onclick="reviewCAR('${car.id}', 'revision_requested')">Request Revision</button>
          <button class="btn btn-success" onclick="reviewCAR('${car.id}', 'approved')">Approve & Lift Suspension</button>
        `;
      }
      
      openModal('car-modal');
    }

    function showCARRejectionForm() {
      const section = document.getElementById('car-rejection-section');
      if (section) {
        section.style.display = 'block';
        document.getElementById('car-rejection-reason')?.focus();
      }
    }

    async function reviewCAR(carId, decision) {
      if (!carId) {
        showToast('No CAR selected', 'error');
        return;
      }
      
      const adminNotes = document.getElementById('car-admin-notes')?.value?.trim() || null;
      const rejectionReason = document.getElementById('car-rejection-reason')?.value?.trim() || null;
      
      if (decision === 'rejected' && !rejectionReason) {
        showToast('Please provide a rejection reason', 'error');
        document.getElementById('car-rejection-reason')?.focus();
        return;
      }
      
      const confirmMessages = {
        'approved': 'Approve this CAR and lift the provider\'s suspension?',
        'rejected': 'Reject this CAR? The provider will remain suspended.',
        'revision_requested': 'Request revisions to this CAR? The provider will need to update and resubmit.'
      };
      
      if (!confirm(confirmMessages[decision] || 'Proceed with this action?')) return;
      
      try {
        const user = await getCurrentUser();
        if (!user) {
          showToast('You must be logged in to review CARs', 'error');
          return;
        }
        
        const { data, error } = await supabaseClient.rpc('review_corrective_action', {
          p_car_id: carId,
          p_admin_id: user.id,
          p_decision: decision,
          p_admin_notes: adminNotes,
          p_rejection_reason: rejectionReason
        });
        
        if (error) {
          console.error('Error reviewing CAR:', error);
          showToast('Failed to submit review: ' + error.message, 'error');
          return;
        }
        
        const successMessages = {
          'approved': 'CAR approved! Provider suspension has been lifted.',
          'rejected': 'CAR rejected. Provider remains suspended.',
          'revision_requested': 'Revision requested. Provider has been notified.'
        };
        
        showToast(successMessages[decision] || 'Review submitted successfully', 'success');
        closeModal('car-modal');
        await loadPendingCARs();
        await loadProviders();
      } catch (err) {
        console.error('reviewCAR error:', err);
        showToast('Error submitting review: ' + err.message, 'error');
      }
    }

    document.getElementById('car-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#car-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filterCARs(e.target.dataset.filter);
      }
    });

    // ========== REGISTRATION VERIFICATIONS ==========
    async function loadRegistrationVerifications(status = null) {
      const tbody = document.getElementById('registration-verifications-tbody');
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        // Task #355 — surface auth state via the shared "Sign in again" prompt.
        if (!session) {
          if (tbody) {
            const err = new Error('No admin session — please sign in again to view verifications.');
            err.code = 'NO_ADMIN_AUTH';
            renderAdminAuthErrorRow(tbody, 7, err, () => loadRegistrationVerifications(status));
          }
          return;
        }

        let url = '/api/registration/verifications';
        if (status && status !== 'all') {
          url += `?status=${status}`;
        }

        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
          console.error('Failed to load registration verifications');
          if ((response.status === 401 || response.status === 403) && tbody) {
            const err = new Error(`Admin session rejected on /api/registration/verifications (HTTP ${response.status}). Sign in again.`);
            err.code = 'ADMIN_AUTH_REJECTED';
            renderAdminAuthErrorRow(tbody, 7, err, () => loadRegistrationVerifications(status));
            return;
          }
          registrationVerifications = [];
          renderRegistrationVerifications();
          return;
        }

        const data = await response.json();
        registrationVerifications = data.verifications || [];
        
        updateRegistrationStats();
        renderRegistrationVerifications();
        updateRegistrationBadge();
      } catch (err) {
        console.error('Error loading registration verifications:', err);
        registrationVerifications = [];
        renderRegistrationVerifications();
      }
    }

    function updateRegistrationStats() {
      const needsReview = registrationVerifications.filter(v => ['needs_review', 'manual_review'].includes(v.status)).length;
      const pending = registrationVerifications.filter(v => v.status === 'pending').length;
      const approved = registrationVerifications.filter(v => v.status === 'approved').length;
      const rejected = registrationVerifications.filter(v => v.status === 'rejected').length;

      const needsReviewEl = document.getElementById('reg-needs-review');
      const pendingEl = document.getElementById('reg-pending');
      const approvedEl = document.getElementById('reg-approved');
      const rejectedEl = document.getElementById('reg-rejected');

      if (needsReviewEl) needsReviewEl.textContent = needsReview;
      if (pendingEl) pendingEl.textContent = pending;
      if (approvedEl) approvedEl.textContent = approved;
      if (rejectedEl) rejectedEl.textContent = rejected;
    }

    function updateRegistrationBadge() {
      const needsReview = registrationVerifications.filter(v =>
        ['needs_review', 'manual_review', 'pending'].includes(v.status)
      ).length;
      const badgeEl = document.getElementById('registration-count');
      if (badgeEl) {
        badgeEl.textContent = needsReview;
        badgeEl.style.display = needsReview > 0 ? 'inline-block' : 'none';
      }
    }

    function renderRegistrationVerifications() {
      const tbody = document.getElementById('registration-verifications-table');
      if (!tbody) return;

      let filtered = registrationVerifications;
      if (currentFilters.registrations && currentFilters.registrations !== 'all') {
        filtered = registrationVerifications.filter(v => v.status === currentFilters.registrations);
      }

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No verification requests found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(v => {
        const userName = v.user?.full_name || v.user?.email || 'Unknown User';
        const vehicleInfo = v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
        const matchScore = v.name_match_score !== null && v.name_match_score !== undefined
          ? Math.round(v.name_match_score)
          : '--';
        const scoreColor = matchScore === '--' ? 'var(--text-muted)'
          : matchScore >= 80 ? 'var(--accent-green)'
          : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        const submittedDate = v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A';
        const contextNote = v.context_note
          ? `<span style="font-size:0.8rem;color:var(--text-secondary);font-style:italic;" title="${v.context_note}">${v.context_note.length > 40 ? v.context_note.slice(0, 40) + '…' : v.context_note}</span>`
          : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';

        return `
          <tr style="cursor:pointer;" onclick="openVerificationDetail('${v.id}')">
            <td>
              <div><strong>${userName}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${v.user?.email || ''}</div>
            </td>
            <td>${vehicleInfo}</td>
            <td><span class="status-badge ${v.status === 'needs_review' || v.status === 'manual_review' ? 'orange' : v.status === 'pending' ? 'blue' : v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'rejected' : 'muted'}">${(v.status || 'unknown').replace(/_/g, ' ')}</span></td>
            <td><span style="color:${scoreColor};font-weight:600;">${matchScore}${matchScore !== '--' ? '%' : ''}</span></td>
            <td>${contextNote}</td>
            <td>${submittedDate}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openVerificationDetail('${v.id}')">Review</button></td>
          </tr>
        `;
      }).join('');
    }

    async function openVerificationDetail(verificationId) {
      currentVerification = registrationVerifications.find(v => v.id === verificationId);
      if (!currentVerification) {
        showToast('Verification not found', 'error');
        return;
      }

      const v = currentVerification;
      const userName = v.user?.full_name || 'Unknown User';
      const userEmail = v.user?.email || '';
      const vehicleInfo = v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
      const matchScore = v.name_match_score !== null && v.name_match_score !== undefined 
        ? Math.round(v.name_match_score) 
        : null;

      const modalBody = document.getElementById('verification-modal-body');
      modalBody.innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} User & Vehicle Information</div>
          <div class="detail-grid">
            <span class="detail-label">User Name:</span>
            <span class="detail-value">${userName}</span>
            <span class="detail-label">User Email:</span>
            <span class="detail-value">${userEmail}</span>
            <span class="detail-label">Vehicle:</span>
            <span class="detail-value">${vehicleInfo}</span>
            <span class="detail-label">Status:</span>
            <span class="detail-value"><span class="status-badge ${(v.status === 'needs_review' || v.status === 'manual_review') ? 'orange' : v.status === 'pending' ? 'blue' : v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'rejected' : 'muted'}">${v.status?.replace('_', ' ') || 'unknown'}</span></span>
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${v.created_at ? new Date(v.created_at).toLocaleString() : 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('camera', 24)} Registration Image</div>
          ${v.registration_image_url ? `
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <img src="${v.registration_image_url}" alt="Registration Document" style="max-width:100%;max-height:400px;border-radius:var(--radius-sm);cursor:pointer;" onclick="window.open('${v.registration_image_url}', '_blank')">
              <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">Click image to open in new tab</div>
            </div>
          ` : '<p style="color:var(--text-muted);">No image uploaded (or link expired — refresh to view)</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('file-text', 24)} Extracted Text (OCR Results)</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);max-height:200px;overflow-y:auto;">
            <pre style="font-family:monospace;font-size:0.85rem;white-space:pre-wrap;color:var(--text-primary);margin:0;">${v.extracted_text || 'No text extracted'}</pre>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('search', 24)} Name Comparison</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Extracted Owner Name</div>
              <div style="font-size:1.1rem;font-weight:600;">${v.extracted_owner_name || 'Not detected'}</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Profile Name</div>
              <div style="font-size:1.1rem;font-weight:600;">${userName}</div>
            </div>
          </div>
          ${matchScore !== null ? `
            <div style="margin-top:16px;padding:16px;border-radius:var(--radius-md);background:${matchScore >= 80 ? 'var(--accent-green-soft)' : matchScore >= 50 ? 'var(--accent-orange-soft)' : 'var(--accent-red-soft)'};">
              <div style="display:flex;align-items:center;gap:16px;">
                <div style="font-size:2rem;font-weight:700;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}%</div>
                <div>
                  <div style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${matchScore >= 80 ? mccIcon('check', 16) + ' Good Match' : matchScore >= 50 ? mccIcon('alert-triangle', 16) + ' Partial Match' : mccIcon('x', 16) + ' Poor Match'}</div>
                  <div style="font-size:0.85rem;color:var(--text-muted);">Name match confidence score</div>
                </div>
              </div>
              <div style="margin-top:12px;height:8px;background:var(--bg-card);border-radius:4px;overflow:hidden;">
                <div style="width:${matchScore}%;height:100%;background:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};border-radius:4px;"></div>
              </div>
            </div>
          ` : '<p style="color:var(--text-muted);margin-top:8px;">Match score not available</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Extracted Details</div>
          <div class="detail-grid">
            <span class="detail-label">VIN:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_vin || 'Not detected'}</span>
            <span class="detail-label">Plate Number:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_plate || 'Not detected'}</span>
          </div>
        </div>

        ${v.context_note ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('message-circle', 24)} Member Context Note</div>
          <div style="background:var(--accent-gold-soft);border:1px solid rgba(201,168,76,0.3);padding:14px 16px;border-radius:var(--radius-md);font-style:italic;color:var(--text-primary);">"${v.context_note}"</div>
        </div>
        ` : ''}

        ${v.status !== 'approved' && v.status !== 'rejected' ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Admin Notes</div>
          <textarea class="form-textarea" id="verification-admin-notes" placeholder="Add notes about this verification decision (optional)..." rows="3"></textarea>
        </div>
        ` : ''}

        ${v.admin_notes ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Previous Admin Notes</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${v.admin_notes}</div>
        </div>
        ` : ''}
      `;

      const footer = document.getElementById('verification-modal-footer');
      if (v.status === 'approved' || v.status === 'rejected') {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('verification-modal')">Close</button>
        `;
      } else {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('verification-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectVerification()">Reject</button>
          <button class="btn btn-success" onclick="approveVerification()">Approve</button>
        `;
      }

      // Note: verification-modal (like every .modal-backdrop) has an inline
      // style="display:none;" baked into its HTML, which beats any CSS rule
      // (including .modal-backdrop.active { display:flex }) by specificity.
      // classList.add('active') alone silently does nothing visible — use
      // the shared openModal() helper, which also flips style.display.
      openModal('verification-modal');
    }
    globalThis.openVerificationDetail = openVerificationDetail;

    async function approveVerification() {
      if (!currentVerification) {
        showToast('No verification selected', 'error');
        return;
      }

      const notes = document.getElementById('verification-admin-notes')?.value?.trim() || null;

      if (!confirm('Approve this registration verification?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('You must be logged in', 'error');
          return;
        }

        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/registration/verifications/${currentVerification.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'approved',
            admin_notes: notes
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to approve verification');
        }

        showToast('Verification approved successfully', 'success');
        closeModal('verification-modal');
        await loadRegistrationVerifications();
      } catch (err) {
        console.error('Error approving verification:', err);
        showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.approveVerification = approveVerification;

    async function rejectVerification() {
      if (!currentVerification) {
        showToast('No verification selected', 'error');
        return;
      }

      const notes = document.getElementById('verification-admin-notes')?.value?.trim() || null;

      if (!confirm('Reject this registration verification?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('You must be logged in', 'error');
          return;
        }

        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/registration/verifications/${currentVerification.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'rejected',
            admin_notes: notes
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to reject verification');
        }

        showToast('Verification rejected', 'success');
        closeModal('verification-modal');
        await loadRegistrationVerifications();
      } catch (err) {
        console.error('Error rejecting verification:', err);
        showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.rejectVerification = rejectVerification;

    document.getElementById('registration-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#registration-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentFilters.registrations = e.target.dataset.filter;
        renderRegistrationVerifications();
      }
    });

    // ── Top-level view switcher: Registration Docs ↔ Held Pickups ────────────
    document.getElementById('reg-view-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-reg-view]');
      if (!tab) return;
      document.querySelectorAll('#reg-view-tabs [data-reg-view]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.regView;
      document.getElementById('reg-panel-verifications').style.display = view === 'verifications' ? '' : 'none';
      document.getElementById('reg-panel-held-rides').style.display    = view === 'held-rides'    ? '' : 'none';
      document.getElementById('reg-panel-insurance').style.display     = view === 'insurance'     ? '' : 'none';
      if (view === 'held-rides') loadHeldRides();
      if (view === 'insurance')  loadInsuranceVerifications();
    });

    // ── Held Pickups (pending_name_review rides) ──────────────────────────────
    let heldRides = [];

    async function loadHeldRides() {
      const tbody = document.getElementById('held-rides-table');
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Not signed in</td></tr>'; return; }
        const res = await fetch('/api/registration/held-rides', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) { if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load</td></tr>'; return; }
        const data = await res.json();
        heldRides = data.rides || [];
        renderHeldRides();
        updateHeldRidesBadge();
      } catch (err) {
        console.error('[admin] held-rides error:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Error loading held pickups</td></tr>';
      }
    }

    function updateHeldRidesBadge() {
      const badge = document.getElementById('held-rides-badge');
      const regCount = document.getElementById('registration-count');
      if (badge) { badge.textContent = heldRides.length; badge.style.display = heldRides.length ? 'inline-block' : 'none'; }
      if (regCount) {
        const verifPending = registrationVerifications.filter(v => ['pending','manual_review','needs_review'].includes(v.status)).length;
        const insPending   = insuranceVerificationsList.filter(v => v.status === 'manual_review').length;
        const total = verifPending + heldRides.length + insPending;
        regCount.textContent = total;
        regCount.style.display = total ? 'inline-block' : 'none';
      }
    }

    function renderHeldRides() {
      const tbody = document.getElementById('held-rides-table');
      if (!tbody) return;
      if (!heldRides.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No held pickups — all clear.</td></tr>';
        return;
      }
      tbody.innerHTML = heldRides.map(r => {
        const member = r.member?.full_name || r.member?.email || 'Unknown';
        const vehicleStr = `${r.member_vehicle_year || ''} ${r.member_vehicle_make || ''} ${r.member_vehicle_model || ''}`.trim() || 'Unknown vehicle';
        // Dig into nested verif — server returns vehicle.verif as array or object
        const verifArr = Array.isArray(r.vehicle?.verif) ? r.vehicle.verif : (r.vehicle?.verif ? [r.vehicle.verif] : []);
        const verif = verifArr[0] || {};
        const score = verif.name_match_score != null ? Math.round(verif.name_match_score) : '--';
        const scoreColor = score === '--' ? 'var(--text-muted)' : score >= 80 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        const extractedOwner = verif.extracted_owner_name || '—';
        const contextNote = verif.context_note
          ? `<span style="font-size:0.78rem;font-style:italic;color:var(--text-secondary);" title="${verif.context_note}">${verif.context_note.length > 35 ? verif.context_note.slice(0, 35) + '…' : verif.context_note}</span>`
          : '<span style="color:var(--text-muted);font-size:0.78rem;">—</span>';
        const fare = r.estimated_fare != null ? `$${Number(r.estimated_fare).toFixed(2)}` : '—';
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
        return `
          <tr>
            <td><strong>${member}</strong><div style="font-size:0.78rem;color:var(--text-muted);">${r.member?.email || ''}</div></td>
            <td style="font-size:0.88rem;">${vehicleStr}</td>
            <td style="font-size:0.88rem;">${extractedOwner}</td>
            <td><span style="color:${scoreColor};font-weight:600;">${score}${score !== '--' ? '%' : ''}</span></td>
            <td>${contextNote}</td>
            <td>${fare}</td>
            <td style="font-size:0.82rem;">${date}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm" style="background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(74,200,140,0.3);" onclick="approveHeldRide('${r.id}')">Approve</button>
                <button class="btn btn-sm" style="background:var(--accent-red-soft);color:var(--accent-red);border:1px solid rgba(239,95,95,0.3);" onclick="rejectHeldRide('${r.id}')">Reject</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function approveHeldRide(rideId) {
      if (!confirm('Approve this pickup? The ride will enter the driver dispatch queue immediately.')) return;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(`/api/registration/held-rides/${rideId}/approve`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed');
        showToast('Pickup approved — ride queued for dispatch.', 'success');
        await loadHeldRides();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }
    globalThis.approveHeldRide = approveHeldRide;

    async function rejectHeldRide(rideId) {
      if (!confirm('Reject and cancel this pickup? The payment hold will be released.')) return;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(`/api/registration/held-rides/${rideId}/reject`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed');
        showToast('Pickup rejected and payment voided.', 'success');
        await loadHeldRides();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }
    globalThis.rejectHeldRide = rejectHeldRide;

    // ── Insurance Verification Admin ──────────────────────────────────────────
    let insuranceVerificationsList = [];
    let currentInsuranceVerifFilter = 'all';

    async function loadInsuranceVerifications(status = null) {
      const tbody = document.getElementById('insurance-verifications-table');
      const filter = status || currentInsuranceVerifFilter;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Not signed in</td></tr>'; return; }
        let insVerifUrl = '/api/insurance/verifications';
        if (filter && filter !== 'all') insVerifUrl += `?status=${filter}`;
        const res = await fetch(insVerifUrl, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) { if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Failed to load</td></tr>'; return; }
        const data = await res.json();
        insuranceVerificationsList = data.verifications || [];
        renderInsuranceVerifications();
        updateInsuranceBadge();
        updateHeldRidesBadge();
      } catch (err) {
        console.error('[admin] insurance verifications error:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Error loading</td></tr>';
      }
    }
    globalThis.loadInsuranceVerifications = loadInsuranceVerifications;

    function updateInsuranceBadge() {
      const badge = document.getElementById('insurance-reviews-badge');
      const count = insuranceVerificationsList.filter(v => v.status === 'manual_review').length;
      if (badge) { badge.textContent = count; badge.style.display = count ? 'inline-block' : 'none'; }
    }

    function renderInsuranceVerifications() {
      const tbody = document.getElementById('insurance-verifications-table');
      if (!tbody) return;
      if (!insuranceVerificationsList.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No insurance verifications.</td></tr>';
        return;
      }
      const statusColors = { approved: 'badge-success', manual_review: 'badge-warning', expired: 'badge-danger', rejected: 'badge-secondary' };
      const statusLabels = { approved: 'Approved', manual_review: 'Pending Review', expired: 'Expired', rejected: 'Rejected' };
      tbody.innerHTML = insuranceVerificationsList.map(v => {
        const member  = v.user?.full_name || v.user?.email || 'Unknown';
        const vehicle = v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : '—';
        const score   = v.name_match_score != null ? v.name_match_score : '—';
        const scoreColor = score === '—' ? 'var(--text-muted)' : score >= 80 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        const expiry  = v.expiration_date ? new Date(v.expiration_date + 'T00:00:00Z').toLocaleDateString() : '—';
        const isExpiredDate = v.expiration_date && new Date(v.expiration_date + 'T00:00:00Z') < new Date();
        const expiryHtml = `<span style="color:${isExpiredDate ? 'var(--accent-red)' : 'inherit'}">${expiry}</span>`;
        const contextNote = v.context_note
          ? `<span title="${v.context_note}" style="font-size:0.78rem;font-style:italic;">${v.context_note.length > 30 ? v.context_note.slice(0,30)+'…' : v.context_note}</span>`
          : '<span style="color:var(--text-muted);font-size:0.78rem;">—</span>';
        return `
          <tr>
            <td><strong>${member}</strong><div style="font-size:0.78rem;color:var(--text-muted);">${v.user?.email || ''}</div></td>
            <td style="font-size:0.88rem;">${vehicle}</td>
            <td style="font-size:0.88rem;">${v.carrier || '—'}</td>
            <td>${expiryHtml}</td>
            <td><span style="color:${scoreColor};font-weight:600;">${score}${score !== '—' ? '%' : ''}</span></td>
            <td><span class="badge ${statusColors[v.status] || 'badge-secondary'}">${statusLabels[v.status] || v.status}</span></td>
            <td>${contextNote}</td>
            <td style="font-size:0.82rem;">${new Date(v.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="openInsuranceVerificationDetail('${v.id}')">Review</button></td>
          </tr>`;
      }).join('');
    }

    // Insurance filter tabs
    document.getElementById('insurance-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-ins-filter]');
      if (!tab) return;
      document.querySelectorAll('#insurance-tabs [data-ins-filter]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentInsuranceVerifFilter = tab.dataset.insFilter;
      loadInsuranceVerifications(currentInsuranceVerifFilter);
    });

    globalThis.openInsuranceVerificationDetail = async function(verifId) {
      const v = insuranceVerificationsList.find(x => x.id === verifId);
      if (!v) return;

      const statusColors = { approved: 'var(--accent-green)', manual_review: 'var(--accent-gold)', expired: 'var(--accent-red)', rejected: 'var(--accent-red)' };
      const statusLabels = { approved: 'Approved', manual_review: 'Pending Review', expired: 'Expired', rejected: 'Rejected' };
      const isExpiredDate = v.expiration_date && new Date(v.expiration_date + 'T00:00:00Z') < new Date();
      const score = v.name_match_score != null ? v.name_match_score : null;
      const scoreColor = score == null ? 'var(--text-muted)' : score >= 80 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';

      let crossRefHtml = '<div style="color:var(--text-muted);font-size:0.85rem;">Loading cross-reference...</div>';

      document.getElementById('insurance-detail-body').innerHTML = `
        <div class="detail-grid" style="row-gap:10px;margin-bottom:20px;">
          <span class="detail-label">Member</span><span class="detail-value">${v.user?.full_name || '—'} <small style="color:var(--text-muted)">${v.user?.email || ''}</small></span>
          <span class="detail-label">Vehicle</span><span class="detail-value">${v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : '—'}${v.vehicle?.vin ? ` <small style="color:var(--text-muted)">VIN: ${v.vehicle.vin}</small>` : ''}</span>
          <span class="detail-label">Status</span><span class="detail-value" style="color:${statusColors[v.status] || 'inherit'};font-weight:600;">${statusLabels[v.status] || v.status}</span>
          <span class="detail-label">Policyholder</span><span class="detail-value">${v.policyholder_name || '—'}</span>
          <span class="detail-label">Account Name</span><span class="detail-value">${v.profile_name || '—'}</span>
          <span class="detail-label">Name Match</span><span class="detail-value"><span style="color:${scoreColor};font-weight:600;">${score != null ? score + '%' : '—'}</span></span>
          <span class="detail-label">Carrier</span><span class="detail-value">${v.carrier || '—'}</span>
          <span class="detail-label">Policy #</span><span class="detail-value">${v.policy_number || '—'}</span>
          <span class="detail-label">Effective</span><span class="detail-value">${v.effective_date || '—'}</span>
          <span class="detail-label">Expires</span><span class="detail-value" style="color:${isExpiredDate ? 'var(--accent-red)' : 'inherit'}">${v.expiration_date || '—'}${isExpiredDate ? ' ⚠ Expired' : ''}</span>
          <span class="detail-label">VIN on Card</span><span class="detail-value">${v.vin || '—'}</span>
          ${v.context_note ? `<span class="detail-label">Context Note</span><span class="detail-value" style="background:var(--accent-gold-soft);border:1px solid rgba(201,162,71,0.3);padding:8px;border-radius:6px;">${v.context_note}</span>` : ''}
        </div>
        ${v.image_url ? `<div style="margin-bottom:20px;"><a href="${v.image_url}" target="_blank"><img src="${v.image_url}" alt="Insurance card" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border-color);"></a></div>` : ''}
        <div id="ins-cross-ref-panel" style="margin-bottom:16px;">${crossRefHtml}</div>`;

      document.getElementById('insurance-detail-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('insurance-detail-modal')">Close</button>
        ${['manual_review','expired'].includes(v.status) ? `
          <button class="btn btn-danger" onclick="rejectInsuranceVerification('${v.id}')">Reject</button>
          <button class="btn btn-success" onclick="approveInsuranceVerification('${v.id}')">Approve</button>` : ''}`;

      openModal('insurance-detail-modal');

      // Load three-way cross-ref asynchronously
      if (v.vehicle_id) {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          const res = await fetch(`/api/insurance/name-cross-ref/${v.vehicle_id}`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          });
          if (res.ok) {
            const cr = await res.json();
            const confColor = cr.confidence === 'high' ? 'var(--accent-green)' : cr.confidence === 'medium' ? 'var(--accent-gold)' : 'var(--accent-red)';
            const sourcesHtml = Object.entries(cr.sources || {})
              .filter(([,v]) => v)
              .map(([k, val]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--text-muted);text-transform:capitalize;">${k.replace('_', ' ')}</span><span style="font-weight:500;">${val}</span></div>`)
              .join('');
            const mismatchesHtml = cr.mismatches?.length
              ? cr.mismatches.map(p => `<div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:0.85rem;"><span style="color:var(--accent-red);">${p.source_a} ↔ ${p.source_b}: ${p.score}%</span><div style="color:var(--text-muted);">"${p.name_a}" vs "${p.name_b}"</div></div>`).join('')
              : '<div style="color:var(--accent-green);font-size:0.85rem;">All sources align.</div>';
            document.getElementById('ins-cross-ref-panel').innerHTML = `
              <div style="background:var(--bg-elevated);border-radius:8px;padding:16px;border:1px solid var(--border-subtle);">
                <div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                  Name Cross-Reference
                  <span style="font-size:0.82rem;padding:2px 8px;border-radius:20px;background:${confColor}22;color:${confColor};border:1px solid ${confColor}44;">${cr.confidence?.replace('_', ' ') || '—'} confidence</span>
                </div>
                <div style="margin-bottom:12px;">${sourcesHtml}</div>
                <div style="font-weight:500;margin-bottom:8px;font-size:0.85rem;color:var(--text-muted);">Mismatches (&lt;80%)</div>
                ${mismatchesHtml}
              </div>`;
          }
        } catch (e) {
          document.getElementById('ins-cross-ref-panel').innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">Cross-reference unavailable.</div>';
        }
      }
    };

    globalThis.approveInsuranceVerification = async function(verifId) {
      if (!confirm('Approve this insurance verification? This will mark the vehicle insurance as verified.')) return;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(`/api/insurance/verifications/${verifId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ status: 'approved' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed');
        showToast('Insurance verification approved.', 'success');
        closeModal('insurance-detail-modal');
        await loadInsuranceVerifications();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    globalThis.rejectInsuranceVerification = async function(verifId) {
      if (!confirm('Reject this insurance verification?')) return;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch(`/api/insurance/verifications/${verifId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ status: 'rejected' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed');
        showToast('Insurance verification rejected.', 'success');
        closeModal('insurance-detail-modal');
        await loadInsuranceVerifications();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };
    // ── End Insurance Verification Admin ──────────────────────────────────────

    // Also load held rides count when the section first loads (for badge)
    const _origLoadRegVerif = loadRegistrationVerifications;
    loadRegistrationVerifications = async function(status = null) {
      await _origLoadRegVerif(status);
      // Fire background fetches for badge accuracy
      loadHeldRides().catch(() => {});
      loadInsuranceVerifications().catch(() => {});
    };
    // ── End Held Pickups ──────────────────────────────────────────────────────

    globalThis.loadRefunds = loadRefunds;
    globalThis.changeRefundsPage = changeRefundsPage;
    globalThis.approveRefund = approveRefund;
    globalThis.denyRefund = denyRefund;
    globalThis.viewRefund = viewRefund;

    async function logout() { localStorage.removeItem('mcc_admin_pass'); localStorage.removeItem('mcc_admin_team_token'); await supabaseClient.auth.signOut(); window.location.href = 'login.html'; }
    globalThis.logout = logout;

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    }
    globalThis.toggleSidebar = toggleSidebar;

