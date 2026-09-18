    // ========== TEAM LOGIN & ROLE-BASED ACCESS ==========
    function getAdminHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (_adminBearer) headers['Authorization'] = 'Bearer ' + _adminBearer;
      if (adminTeamToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + adminTeamToken;
      return headers;
    }

    // 2026-09-04f — shared by the explicit Team Login form AND the
    // fallback paths below: a team member's real credentials also pass the
    // ordinary admin Sign In form (they're genuine Supabase Auth accounts),
    // which used to dead-end at "Access Denied" because it only ever
    // checked profiles.role === 'admin'. Whichever path resolves team
    // membership finishes the same way, via this one function.
    async function completeTeamLoginFrom(data) {
      if (_authCompletionInFlight) return;
      _authCompletionInFlight = true;
      try {
        adminTeamToken = data.token;
        adminTeamUser = data.user;
        adminPermissions = data.permissions;
        adminPasswordVerified = false;
        // Expose to window + localStorage so external helper scripts (e.g.
        // www/admin-agent-activity.js) can read the same credential when
        // assembling auth headers. Mirrors how mcc_admin_pass is persisted.
        try {
          globalThis.adminTeamToken = data.token;
          if (data.token) localStorage.setItem('adminTeamToken', data.token);
        } catch { /* Intentionally silent */ }

        document.getElementById('admin-password-modal').style.display = 'none';
        applyRolePermissions(data.permissions);
        await loadAllData();
        setupEventListeners();
      } finally {
        _authCompletionInFlight = false;
      }
    }

    // Resolve team membership from email+password (the ordinary Sign In
    // form already has both in hand after a successful Supabase sign-in).
    // Always resolves to {ok, data} rather than throwing/returning null, so
    // callers that DO want the specific server error message (the explicit
    // Team Login form) and callers that only care about ok/not-ok (the
    // fallback paths below) can both use it.
    async function tryTeamLoginByPassword(email, password) {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        return { ok: response.ok && !!data.success, data };
      } catch (err) {
        return { ok: false, data: { error: 'Login failed. Please try again.' } };
      }
    }

    // Resolve team membership from an EXISTING Supabase session token, no
    // password needed — for the onAuthStateChange / page-reload paths that
    // never see a plaintext password (e.g. she signed in once, then just
    // reloaded the page). Hits the GET /api/admin/team-login "whoami" route.
    async function tryTeamLoginByToken(accessToken) {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-login`, {
          headers: { Authorization: 'Bearer ' + accessToken }
        });
        const data = await response.json();
        return { ok: response.ok && !!data.success, data };
      } catch (err) {
        return { ok: false, data: {} };
      }
    }

    async function performTeamLogin() {
      const email = document.getElementById('team-login-email')?.value?.trim();
      const password = document.getElementById('team-login-password')?.value;
      const errorEl = document.getElementById('team-login-error');
      const btn = document.getElementById('admin-modal-btn');

      if (!email || !password) {
        if (errorEl) { errorEl.textContent = 'Please enter email and password.'; errorEl.style.display = 'block'; }
        return;
      }

      btn.textContent = 'Signing in...';
      btn.disabled = true;
      if (errorEl) errorEl.style.display = 'none';

      const result = await tryTeamLoginByPassword(email, password);
      if (!result.ok) {
        if (errorEl) { errorEl.textContent = result.data.error || 'Login failed'; errorEl.style.display = 'block'; }
        btn.textContent = 'Sign In';
        btn.disabled = false;
        return;
      }
      await completeTeamLoginFrom(result.data);
    }
    globalThis.performTeamLogin = performTeamLogin;

    function showTeamLoginMode(e) {
      if (e) e.preventDefault();
      showModalState('team-login');
    }
    globalThis.showTeamLoginMode = showTeamLoginMode;

    function showAdminLoginMode(e) {
      if (e) e.preventDefault();
      showModalState(currentUser ? 'password' : 'login');
    }
    globalThis.showAdminLoginMode = showAdminLoginMode;

    function applyRolePermissions(permissions) {
      const navItems = document.querySelectorAll('.nav-item[data-section]');
      const navLabels = document.querySelectorAll('.nav-label');
      
      if (!permissions) {
        navItems.forEach(item => item.style.display = '');
        navLabels.forEach(label => label.style.display = '');
        return;
      }
      
      navItems.forEach(item => {
        const section = item.dataset.section;
        if (permissions.includes(section)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
      
      navLabels.forEach(label => {
        const group = label.dataset.group;
        const container = group
          ? document.querySelector(`.nav-group-items[data-group="${group}"]`)
          : null;
        const hasVisible = container
          ? [...container.querySelectorAll('.nav-item')].some(el => el.style.display !== 'none')
          : false;
        label.style.display = hasVisible ? '' : 'none';
        if (container) container.style.display = hasVisible ? '' : 'none';
      });
      
      const userInfo = document.createElement('div');
      const existingInfo = document.getElementById('admin-role-badge');
      if (existingInfo) existingInfo.remove();
      if (adminTeamUser) {
        const badge = document.createElement('div');
        badge.id = 'admin-role-badge';
        badge.style.cssText = 'padding:12px 16px;margin-bottom:12px;background:var(--accent-blue-soft);border-radius:var(--radius-md);text-align:center;';
        const roleLabel = (adminTeamUser.role || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        badge.innerHTML = `<div style="font-weight:600;color:var(--text-primary);font-size:0.9rem;">${escapeHtml(adminTeamUser.displayName)}</div><div style="font-size:0.8rem;color:var(--accent-gold);margin-top:4px;">${escapeHtml(roleLabel)}</div>`;
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) sidebarNav.insertBefore(badge, sidebarNav.firstChild);
      }
    }

    // ========== TEAM MANAGEMENT ==========
    let teamMembers = [];

    async function loadTeamMembers() {
      const tbody = document.getElementById('team-members-body');
      try {
        // Task #355 — adminFetch surfaces 401/403 as coded auth errors that
        // we route through the shared "Sign in again" prompt below.
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const data = await aiOpsFetch(`${apiBase}/api/admin/team-members`, { headers: getAdminHeaders() });
        teamMembers = Array.isArray(data) ? data : (data.members || []);
        renderTeamMembers();
        loadPendingInvites();
      } catch (err) {
        console.error('Failed to load team members:', err);
        if (tbody) {
          const isAuthErr = err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED');
          if (isAuthErr) {
            renderAiOpsAuthError(tbody.closest('div, section, [id]') || tbody, err, loadTeamMembers);
          } else {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Failed to load team members</td></tr>';
          }
        }
      }
    }

    function renderTeamMembers() {
      const tbody = document.getElementById('team-members-body');
      if (!tbody) return;
      
      const total = teamMembers.length;
      const active = teamMembers.filter(m => m.status === 'active').length;
      const disabled = total - active;
      const roles = new Set(teamMembers.map(m => m.role));
      
      const totalEl = document.getElementById('team-total');
      const activeEl = document.getElementById('team-active');
      const disabledEl = document.getElementById('team-disabled');
      const rolesEl = document.getElementById('team-roles-count');
      if (totalEl) totalEl.textContent = total;
      if (activeEl) activeEl.textContent = active;
      if (disabledEl) disabledEl.textContent = disabled;
      if (rolesEl) rolesEl.textContent = roles.size;
      
      if (teamMembers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No team members yet. Click "Add Team Member" to get started.</td></tr>';
        return;
      }
      
      const roleBadgeClass = {
        super_admin: 'badge-green',
        crm_manager: 'badge-blue',
        marketing: 'badge-purple',
        operations: 'badge-orange',
        finance: 'badge-gold',
        support: 'badge-teal'
      };
      
      tbody.innerHTML = teamMembers.map(m => {
        const roleLabel = (m.role || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        const badgeClass = roleBadgeClass[m.role] || 'badge-blue';
        const statusBadge = m.status === 'active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Disabled</span>';
        const lastLogin = m.last_login ? new Date(m.last_login).toLocaleDateString() + ' ' + new Date(m.last_login).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Never';
        return `<tr>
          <td>${escapeHtml(m.display_name)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(roleLabel)}</span></td>
          <td>${statusBadge}</td>
          <td>${lastLogin}</td>
          <td>
            <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;" onclick="editTeamMember('${m.id}')">Edit</button>
            <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;color:var(--accent-red);" onclick="deleteTeamMember('${m.id}', '${escapeHtml(m.display_name)}')">Remove</button>
          </td>
        </tr>`;
      }).join('');
    }

    function showAddTeamMemberModal() {
      document.getElementById('team-add-name').value = '';
      document.getElementById('team-add-email').value = '';
      document.getElementById('team-add-password').value = '';
      document.getElementById('team-add-role').value = 'crm_manager';
      document.getElementById('team-add-error').style.display = 'none';
      document.getElementById('add-team-member-modal').style.display = 'flex';
    }
    globalThis.showAddTeamMemberModal = showAddTeamMemberModal;

    function closeTeamMemberModal() {
      document.getElementById('add-team-member-modal').style.display = 'none';
    }
    globalThis.closeTeamMemberModal = closeTeamMemberModal;

    async function addTeamMember() {
      const name = document.getElementById('team-add-name').value.trim();
      const email = document.getElementById('team-add-email').value.trim();
      const password = document.getElementById('team-add-password').value;
      const role = document.getElementById('team-add-role').value;
      const errorEl = document.getElementById('team-add-error');
      const btn = document.getElementById('team-add-btn');
      
      if (!name || !email || !password || !role) {
        errorEl.textContent = 'All fields are required.';
        errorEl.style.display = 'block';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Adding...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ email, password, display_name: name, role })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to add member');
        
        showToast(`${name} added as ${role.replaceAll('_', ' ')}`);
        closeTeamMemberModal();
        await loadTeamMembers();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.textContent = 'Add Member';
        btn.disabled = false;
      }
    }
    globalThis.addTeamMember = addTeamMember;

    function editTeamMember(id) {
      const member = teamMembers.find(m => m.id === id);
      if (!member) return;
      document.getElementById('team-edit-id').value = id;
      document.getElementById('team-edit-name').value = member.display_name;
      document.getElementById('team-edit-role').value = member.role;
      document.getElementById('team-edit-status').value = member.status;
      document.getElementById('team-edit-password').value = '';
      document.getElementById('team-edit-error').style.display = 'none';
      document.getElementById('edit-team-member-modal').style.display = 'flex';
    }
    globalThis.editTeamMember = editTeamMember;

    function closeEditTeamModal() {
      document.getElementById('edit-team-member-modal').style.display = 'none';
    }
    globalThis.closeEditTeamModal = closeEditTeamModal;

    async function saveTeamMember() {
      const id = document.getElementById('team-edit-id').value;
      const name = document.getElementById('team-edit-name').value.trim();
      const role = document.getElementById('team-edit-role').value;
      const status = document.getElementById('team-edit-status').value;
      const password = document.getElementById('team-edit-password').value;
      const errorEl = document.getElementById('team-edit-error');
      const btn = document.getElementById('team-edit-btn');
      
      if (!name) {
        errorEl.textContent = 'Display name is required.';
        errorEl.style.display = 'block';
        return;
      }
      if (password && password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Saving...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const body = { display_name: name, role, status };
        if (password) body.password = password;
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members/${id}`, {
          method: 'PUT',
          headers: getAdminHeaders(),
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update');
        
        showToast('Team member updated');
        closeEditTeamModal();
        await loadTeamMembers();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.textContent = 'Save Changes';
        btn.disabled = false;
      }
    }
    globalThis.saveTeamMember = saveTeamMember;

    async function deleteTeamMember(id, name) {
      if (!confirm(`Are you sure you want to remove ${name} from the team? This cannot be undone.`)) return;
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members/${id}`, {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete');
        showToast(`${name} removed from team`);
        await loadTeamMembers();
      } catch (err) {
        showToast('Failed to remove team member', 'error');
      }
    }
    globalThis.deleteTeamMember = deleteTeamMember;

