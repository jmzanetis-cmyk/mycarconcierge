    // ========== TEAM INVITES ==========
    let currentInviteId = null;
    let currentInviteUrl = null;

    function showInviteModal() {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-role').value = 'crm_manager';
      document.getElementById('invite-error').style.display = 'none';
      document.getElementById('invite-result').style.display = 'none';
      document.getElementById('invite-send-status').textContent = '';
      document.getElementById('invite-generate-btn').style.display = '';
      document.getElementById('invite-send-btn').style.display = 'none';
      const smsBtn = document.getElementById('invite-sms-btn');
      if (smsBtn) smsBtn.style.display = 'none';
      currentInviteId = null;
      currentInviteUrl = null;
      document.getElementById('invite-team-member-modal').style.display = 'flex';
    }
    globalThis.showInviteModal = showInviteModal;

    function closeInviteModal() {
      document.getElementById('invite-team-member-modal').style.display = 'none';
      if (currentInviteId) loadPendingInvites();
    }
    globalThis.closeInviteModal = closeInviteModal;

    async function generateInvite() {
      const email = document.getElementById('invite-email').value.trim();
      const role = document.getElementById('invite-role').value;
      const errorEl = document.getElementById('invite-error');
      const btn = document.getElementById('invite-generate-btn');

      if (!email) {
        errorEl.textContent = 'Please enter an email address.';
        errorEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Generating...';
      errorEl.style.display = 'none';

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ email, role })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate invite');

        currentInviteId = data.invite.id;
        currentInviteUrl = data.inviteUrl;
        document.getElementById('invite-link-display').value = data.inviteUrl;
        document.getElementById('invite-result').style.display = 'block';
        document.getElementById('invite-generate-btn').style.display = 'none';
        document.getElementById('invite-send-btn').style.display = '';
        document.getElementById('invite-sms-btn').style.display = '';
        showToast('Invite generated successfully');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Invite';
      }
    }
    globalThis.generateInvite = generateInvite;

    function copyInviteLink() {
      const linkEl = document.getElementById('invite-link-display');
      if (linkEl?.value) {
        navigator.clipboard.writeText(linkEl.value).then(() => {
          showToast('Invite link copied to clipboard');
        }).catch(() => {
          linkEl.select();
          document.execCommand('copy');
          showToast('Invite link copied');
        });
      }
    }
    globalThis.copyInviteLink = copyInviteLink;

    async function sendInviteEmail() {
      if (!currentInviteId) return;
      const btn = document.getElementById('invite-send-btn');
      const statusEl = document.getElementById('invite-send-status');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      statusEl.textContent = '';

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${currentInviteId}/send-email`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send email');
        statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ Email sent successfully</span>';
        showToast('Invite email sent');
      } catch (err) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">✗ ' + escapeHtml(err.message) + '</span>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send via Email';
      }
    }
    globalThis.sendInviteEmail = sendInviteEmail;

    function showSmsSendDialog() {
      if (!currentInviteId) return;
      const statusEl = document.getElementById('invite-send-status');
      statusEl.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <input type="tel" id="invite-sms-phone" placeholder="+1 (555) 123-4567" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;" />
          <button class="btn btn-primary" onclick="sendInviteSms()" style="background:#2d8a6e;white-space:nowrap;">Send SMS</button>
        </div>
      `;
      const phoneInput = document.getElementById('invite-sms-phone');
      if (phoneInput) phoneInput.focus();
    }
    globalThis.showSmsSendDialog = showSmsSendDialog;

    async function sendInviteSms() {
      if (!currentInviteId) return;
      const phoneInput = document.getElementById('invite-sms-phone');
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const statusEl = document.getElementById('invite-send-status');

      if (!phone) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">Please enter a phone number</span>';
        return;
      }

      const smsBtn = document.getElementById('invite-sms-btn');
      if (smsBtn) { smsBtn.disabled = true; smsBtn.textContent = 'Sending...'; }

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${currentInviteId}/send-sms`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send SMS');
        statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ SMS sent successfully</span>';
        showToast('Invite SMS sent');
      } catch (err) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">✗ ' + escapeHtml(err.message) + '</span>';
      } finally {
        if (smsBtn) { smsBtn.disabled = false; smsBtn.textContent = 'Send via SMS'; }
      }
    }
    globalThis.sendInviteSms = sendInviteSms;

    async function loadPendingInvites() {
      const tbody = document.getElementById('pending-invites-body');
      if (!tbody) return;
      try {
        // Task #355 — adminFetch routes 401/403 through the shared auth row.
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const invites = await aiOpsFetch(`${apiBase}/api/admin/team-invites`, { headers: getAdminHeaders() });

        const roleBadgeClass = {
          super_admin: 'badge-green', crm_manager: 'badge-blue', marketing: 'badge-purple',
          operations: 'badge-orange', finance: 'badge-gold', support: 'badge-teal'
        };

        // Display-only dedupe: an email can end up with more than one
        // accepted invite row over time (e.g. re-invited after already
        // accepting once) — harmless in the DB, but clutters this list with
        // repeats. invites is already sorted created_at desc, so keep the
        // first (newest) accepted row per email and drop older accepted
        // duplicates. Pending/revoked rows are never deduped or touched,
        // and no rows are altered server-side.
        const seenAcceptedEmails = new Set();
        const visibleInvites = invites.filter(inv => {
          if (inv.status !== 'accepted') return true;
          const key = (inv.email || '').toLowerCase();
          if (seenAcceptedEmails.has(key)) return false;
          seenAcceptedEmails.add(key);
          return true;
        });

        if (visibleInvites.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No pending invites</td></tr>';
          return;
        }

        tbody.innerHTML = visibleInvites.map(inv => {
          const roleLabel = (inv.role || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
          const badgeClass = roleBadgeClass[inv.role] || 'badge-blue';
          const statusClass = inv.status === 'pending' ? 'badge-orange' : inv.status === 'accepted' ? 'badge-green' : 'badge-red';
          const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
          const created = new Date(inv.created_at).toLocaleDateString();
          const expires = new Date(inv.expires_at).toLocaleDateString() + ' ' + new Date(inv.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
          const inviteUrl = inv.token ? `https://mycarconcierge.com/admin-invite.html?token=${inv.token}` : '';
          const copyBtn = inv.token && inv.status === 'pending'
            ? `<button class="btn btn-secondary btn-sm" onclick="copyInviteLinkUrl('${inviteUrl}')" style="font-size:0.78rem;" title="Copy invite link">Copy Link</button>`
            : '';
          const actions = inv.status === 'pending'
            ? `${copyBtn}
               <button class="btn btn-secondary btn-sm" onclick="resendInviteEmail('${inv.id}')" style="font-size:0.78rem;">Resend</button>
               <button class="btn btn-secondary btn-sm" onclick="revokeInvite('${inv.id}', '${escapeHtml(inv.email)}')" style="font-size:0.78rem;color:var(--accent-red);">Revoke</button>`
            : '-';
          return `<tr>
            <td>${escapeHtml(inv.email)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(roleLabel)}</span></td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td>${created}</td>
            <td>${expires}</td>
            <td>${actions}</td>
          </tr>`;
        }).join('');
      } catch (err) {
        const isAuthErr = err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED');
        if (isAuthErr) {
          renderAiOpsAuthError(tbody.closest('div, section, [id]') || tbody, err, loadPendingInvites);
        } else {
          console.error('Failed to load invites:', err);
          tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Failed to load invites</td></tr>';
        }
      }
    }

    async function resendInviteEmail(inviteId) {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${inviteId}/send-email`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send');
        showToast('Invite email resent');
      } catch (err) {
        showToast('Failed to resend: ' + err.message, 'error');
      }
    }
    globalThis.resendInviteEmail = resendInviteEmail;

    async function revokeInvite(id, email) {
      if (!confirm(`Revoke invite for ${email}? They will no longer be able to use this invite link.`)) return;
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${id}`, {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Failed to revoke');
        showToast('Invite revoked');
        await loadPendingInvites();
      } catch (err) {
        showToast('Failed to revoke invite', 'error');
      }
    }
    globalThis.revokeInvite = revokeInvite;

    function getTeamApiUrl(endpoint) {
      const isNetlify = window.location.hostname.includes('netlify') ||
                        window.location.hostname === 'mycarconcierge.com' ||
                        window.location.hostname === 'www.mycarconcierge.com';
      if (isNetlify) {
        return `/.netlify/functions/admin-team/${endpoint}`;
      }
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      if (endpoint === 'members') return `${apiBase}/api/admin/team-members`;
      if (endpoint === 'invites') return `${apiBase}/api/admin/team-invites`;
      return `${apiBase}/api/admin/team-${endpoint}`;
    }

    let mktShareLinkUrl = null;
    let mktShareLinkGenEmail = null;

    function openMarketingShareModal() {
      const modal = document.getElementById('marketing-share-modal');
      if (!modal) return;
      document.getElementById('mkt-share-email').value = '';
      document.getElementById('mkt-share-invite-error').style.display = 'none';
      mktShareLinkUrl = null;
      mktShareLinkGenEmail = null;
      const copyText = document.getElementById('mkt-share-copy-text');
      if (copyText) copyText.textContent = 'Copy link';
      modal.style.display = 'flex';
      loadMarketingSharePeople();
    }
    globalThis.openMarketingShareModal = openMarketingShareModal;
    const _mktShareBtn = document.getElementById('marketing-share-btn');
    if (_mktShareBtn) _mktShareBtn.addEventListener('click', openMarketingShareModal);

    function closeMarketingShareModal() {
      const modal = document.getElementById('marketing-share-modal');
      if (modal) modal.style.display = 'none';
    }
    globalThis.closeMarketingShareModal = closeMarketingShareModal;

    async function loadMarketingSharePeople() {
      const container = document.getElementById('mkt-share-people-list');
      if (!container) return;
      container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading...</div>';
      try {
        const [membersRes, invitesRes] = await Promise.all([
          fetch(getTeamApiUrl('members'), { headers: getAdminHeaders() }),
          fetch(getTeamApiUrl('invites'), { headers: getAdminHeaders() })
        ]);
        if (!membersRes.ok) throw new Error('Load failed');
        const membersData = await membersRes.json();
        const allMembers = (membersData.members || membersData || []).filter(m =>
          m.role === 'marketing' || m.role === 'super_admin'
        );
        const currentEmail = globalThis._adminEmail || '';
        let html = '';
        if (allMembers.length === 0 && (!invitesRes.ok)) {
          html = '<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:0.88rem;">No collaborators yet. Add people above or share a link.</p>';
          container.innerHTML = html;
          return;
        }
        allMembers.forEach(m => {
          const isYou = currentEmail && m.email && m.email.toLowerCase() === currentEmail.toLowerCase();
          const isOwner = m.role === 'super_admin';
          const roleLabel = isOwner ? 'Owner' : 'Marketing';
          const initials = (m.displayName || m.email || '??').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
          const avatarColors = ['#4285f4','#ea4335','#34a853','#fbbc05','#8e24aa','#00acc1'];
          const colorIdx = (m.email || '').length % avatarColors.length;
          html += `<div style="display:flex;align-items:center;gap:12px;padding:8px 4px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${avatarColors[colorIdx]};display:flex;align-items:center;justify-content:center;font-weight:600;color:#fff;font-size:0.82rem;flex-shrink:0;">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.displayName || m.email)}${isYou ? ' <span style="color:var(--text-muted);font-weight:400;">(you)</span>' : ''}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.email || '')}</div>
            </div>
            <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;">${roleLabel}</div>
          </div>`;
        });
        if (invitesRes.ok) {
          const invitesData = await invitesRes.json();
          const pendingMarketing = (invitesData.invites || invitesData || []).filter(inv => inv.role === 'marketing' && inv.status === 'pending');
          pendingMarketing.forEach(inv => {
            const initials = (inv.email || '??').substring(0, 2).toUpperCase();
            html += `<div style="display:flex;align-items:center;gap:12px;padding:8px 4px;">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--border-subtle);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--text-muted);font-size:0.82rem;flex-shrink:0;">${initials}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(inv.email)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Invitation sent</div>
              </div>
              <div style="font-size:0.78rem;padding:2px 10px;border-radius:12px;background:var(--accent-gold-soft, rgba(251,188,5,0.15));color:var(--accent-gold);">Pending</div>
            </div>`;
          });
        }
        if (!html) {
          html = '<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:0.88rem;">No collaborators yet. Add people above or share a link.</p>';
        }
        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:16px;font-size:0.85rem;">Error loading: ${err.message}</p>`;
      }
    }

    async function sendMarketingInvite() {
      const emailInput = document.getElementById('mkt-share-email');
      const errorEl = document.getElementById('mkt-share-invite-error');
      const btn = document.getElementById('mkt-share-send-btn');
      const email = (emailInput?.value || '').trim();
      errorEl.style.display = 'none';
      if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const res = await fetch(getTeamApiUrl('invites'), {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'marketing' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send invite');
        emailInput.value = '';
        showToast(`Invite sent to ${email}`);
        loadMarketingSharePeople();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send invite';
      }
    }
    globalThis.sendMarketingInvite = sendMarketingInvite;

    async function copyMarketingShareLink() {
      const copyText = document.getElementById('mkt-share-copy-text');
      const btn = document.getElementById('mkt-share-copy-btn');
      if (mktShareLinkUrl) {
        await clipboardCopy(mktShareLinkUrl);
        copyText.textContent = 'Copied!';
        setTimeout(() => { copyText.textContent = 'Copy link'; }, 2000);
        return;
      }
      btn.disabled = true;
      copyText.textContent = 'Generating...';
      try {
        const res = await fetch(getTeamApiUrl('invites'), {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'link-invite@mycarconcierge.com', role: 'marketing' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate link');
        const inviteUrl = data.inviteUrl || data.invite_url || data.link;
        if (!inviteUrl) throw new Error('No invite link returned');
        mktShareLinkUrl = inviteUrl;
        await clipboardCopy(inviteUrl);
        copyText.textContent = 'Copied!';
        setTimeout(() => { copyText.textContent = 'Copy link'; }, 2000);
        loadMarketingSharePeople();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        copyText.textContent = 'Copy link';
      } finally {
        btn.disabled = false;
      }
    }
    globalThis.copyMarketingShareLink = copyMarketingShareLink;

    async function clipboardCopy(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }

    let trafficDays = 7;

    document.querySelectorAll('.traffic-range').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.traffic-range').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        trafficDays = Number.parseInt(btn.dataset.days);
        loadedSections['traffic'] = false;
        loadTrafficData();
      });
    });

    async function loadTrafficData() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const data = await aiOpsFetch(`${apiBase}/api/analytics/data?days=${trafficDays}`, { headers: getAiOpsHeaders() });

        document.getElementById('traffic-total-views').textContent = (data.totalViews || 0).toLocaleString();
        document.getElementById('traffic-total-visitors').textContent = (data.totalVisitors || 0).toLocaleString();
        document.getElementById('traffic-active-now').textContent = (data.activeNow || 0).toLocaleString();

        const dailyData = data.dailyViews || [];
        const avgDaily = dailyData.length > 0 ? Math.round(dailyData.reduce((s, d) => s + d.views, 0) / dailyData.length) : 0;
        document.getElementById('traffic-avg-daily').textContent = avgDaily.toLocaleString();

        renderTrafficBarChart('traffic-daily-chart', dailyData, 'views', 'var(--accent-blue)');
        renderTrafficBarChart('traffic-visitors-chart', dailyData, 'visitors', 'var(--accent-green)');
        renderDeviceBreakdown(data.deviceBreakdown || {});
        renderTopPages(data.topPages || []);
        renderReferrals(data.referralSources || []);
      } catch (err) {
        console.error('Traffic data error:', err);
      }
    }

    function renderTrafficBarChart(containerId, data, field, color) {
      const container = document.getElementById(containerId);
      if (!container || !data.length) {
        if (container) container.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No data available yet</p>';
        return;
      }
      const maxVal = Math.max(...data.map(d => d[field] || 0), 1);
      container.innerHTML = data.map(d => {
        const val = d[field] || 0;
        const height = Math.max((val / maxVal) * 200, 2);
        const dateLabel = d.date ? d.date.slice(5) : '';
        return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:20px;max-width:40px;" title="${d.date}: ${val}">
          <span style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">${val}</span>
          <div style="width:100%;height:${height}px;background:${color};border-radius:4px 4px 0 0;min-height:2px;transition:height 0.3s;"></div>
          <span style="font-size:9px;color:var(--text-muted);margin-top:4px;transform:rotate(-45deg);white-space:nowrap;">${dateLabel}</span>
        </div>`;
      }).join('');
    }

    function renderDeviceBreakdown(devices) {
      const container = document.getElementById('traffic-device-breakdown');
      if (!container) return;
      const total = Object.values(devices).reduce((s, v) => s + v, 0);
      if (total === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No data available yet</p>';
        return;
      }
      const labels = {
        ios_app: { name: 'iOS App', color: '#007AFF', icon: 'smartphone' },
        android_app: { name: 'Android App', color: '#34A853', icon: 'smartphone' },
        desktop_web: { name: 'Desktop Web', color: 'var(--accent-blue)', icon: 'monitor' },
        mobile_web: { name: 'Mobile Web', color: 'var(--accent-gold)', icon: 'smartphone' },
        unknown: { name: 'Unknown', color: 'var(--text-muted)', icon: 'help-circle' }
      };
      let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
      for (const [key, count] of Object.entries(devices).sort((a, b) => b[1] - a[1])) {
        if (count === 0) continue;
        const pct = ((count / total) * 100).toFixed(1);
        const info = labels[key] || { name: key, color: 'var(--text-muted)', icon: 'help-circle' };
        html += `<div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="display:flex;align-items:center;gap:8px;"><span class="icon-inline" data-icon="${info.icon}"></span> ${info.name}</span>
            <span style="font-weight:600;">${count.toLocaleString()} (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${info.color};border-radius:4px;transition:width 0.3s;"></div>
          </div>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
    }

    function renderTopPages(pages) {
      const container = document.getElementById('traffic-top-pages');
      if (!container) return;
      if (!pages.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No data available yet</p>';
        return;
      }
      let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Page</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Views</th></tr></thead><tbody>';
      pages.forEach(p => {
        html += `<tr><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);font-size:0.9rem;word-break:break-all;">${escapeHtml(p.page)}</td><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:600;">${p.views.toLocaleString()}</td></tr>`;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    function renderReferrals(sources) {
      const container = document.getElementById('traffic-referrals');
      if (!container) return;
      if (!sources.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No data available yet</p>';
        return;
      }
      let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Source</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Visits</th></tr></thead><tbody>';
      sources.forEach(s => {
        html += `<tr><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);font-size:0.9rem;word-break:break-all;">${escapeHtml(s.source)}</td><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:600;">${s.count.toLocaleString()}</td></tr>`;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    let currentMktContent = '';
    let currentEmailHtml = '';
    let currentEmailSubject = '';
    let currentStrategyContent = '';
    let currentFundContent = '';

    document.querySelectorAll('.mo-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mo-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.mo-panel').forEach(p => p.style.display = 'none');
        const panelId = 'mo-' + tab.dataset.tab;
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
        if (tab.dataset.tab === 'growth-funnel') loadGrowthFunnel();
        if (tab.dataset.tab === 'provider-calls') initProviderCallList();
        // Task #269 — re-run Outreach Engine init on every click of its
        // mo-tab (even when already active). If a transient error caused
        // the first init to fail and leave the panel blank, the user now
        // has an obvious recovery path: click the tab again.
        if (tab.dataset.tab === 'outreach-engine' && typeof globalThis.initOutreachEngine === 'function') {
          Promise.resolve(globalThis.initOutreachEngine()).catch(err => {
            console.warn('[OutreachEngine] re-init failed:', err);
          });
        }
      });
    });

    // ------------------------------------------------------------------
    // Provider Call List — manual B2B provider-acquisition cold-call
    // tracking. Separate from the AI Outreach Engine above (that one
    // auto-discovers leads and has AI draft+send email/SMS at scale).
    // This is a human caller (Maria) working a fixed phone list market by
    // market. Backed by netlify/functions/admin-provider-outreach.js and
    // supabase/migrations/20260904_provider_call_prospects.sql.
    // ------------------------------------------------------------------
    let pclMarkets = [];
    let pclSelectedMarket = null;
    let pclProspects = [];
    let pclEditingId = null;

    function pclHeaders() { return getMarketingHeaders(); }

    async function initProviderCallList() {
      await loadProviderCallRollup();
      // 2026-09-04c — Survey Results & Trend lives behind a collapsed
      // <details>, same lazy-load-on-first-expand pattern as the Hunter &
      // Promoter activity strip (see initMarketingHub above).
      const resultsDetails = document.getElementById('pcl-results-details');
      if (resultsDetails && !resultsDetails.__pclBound) {
        resultsDetails.__pclBound = true;
        resultsDetails.addEventListener('toggle', () => {
          if (!resultsDetails.open || resultsDetails.__pclLoaded) return;
          resultsDetails.__pclLoaded = true;
          loadProviderCallResults();
        });
      }
    }
    globalThis.initProviderCallList = initProviderCallList;

    function pclPriorityChip(priority) {
      const map = { 1: ['P1', 'var(--accent-green,#4ade80)'], 2: ['P2', 'var(--accent-orange,#fb923c)'], 3: ['P3', 'var(--accent-red,#f87171)'] };
      const [label, color] = map[priority] || ['—', 'var(--text-muted)'];
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;color:#0a0a0a;background:${color};">${label}</span>`;
    }

    async function loadProviderCallRollup() {
      const grid = document.getElementById('pcl-market-grid');
      const summary = document.getElementById('pcl-rollup-summary');
      if (!grid) return;
      try {
        const [rollupRes, marketsRes] = await Promise.all([
          fetch('/api/admin/provider-outreach/rollup', { headers: pclHeaders() }),
          fetch('/api/admin/provider-outreach/markets', { headers: pclHeaders() })
        ]);
        if (!rollupRes.ok || !marketsRes.ok) {
          const status = !rollupRes.ok ? rollupRes.status : marketsRes.status;
          if ((status === 401 || status === 403) && typeof globalThis.renderAdminAuthError === 'function') {
            globalThis.renderAdminAuthError(grid, Object.assign(new Error('Admin session rejected on Provider Call List (HTTP ' + status + '). Sign in again.'), { code: 'ADMIN_AUTH_REJECTED' }), loadProviderCallRollup);
            return;
          }
          grid.innerHTML = `<p style="color:var(--accent-red);">Failed to load rollup (HTTP ${status}).</p>`;
          return;
        }
        const rollupData = await rollupRes.json();
        const marketsData = await marketsRes.json();
        pclMarkets = marketsData.markets || [];
        pclPopulateResultsMarketFilter();
        const byMarket = {};
        (pclMarkets || []).forEach(m => { byMarket[m.market] = m; });
        const rollups = rollupData.markets || [];
        const all = rollupData.all_markets || {};

        if (summary) {
          summary.textContent = `${all.prospects || 0} total prospects across ${rollups.length} markets · ${all.dialed || 0} dialed · ${all.surveys_complete || 0} surveys complete`;
        }

        if (!rollups.length) {
          grid.innerHTML = '<p style="color:var(--text-muted);">No markets found. Run the provider_call_prospects migration in Supabase.</p>';
          return;
        }

        grid.innerHTML = rollups.map(r => {
          const meta = byMarket[r.market] || {};
          const active = r.market === pclSelectedMarket;
          const thresholdColor = r.threshold_met ? 'var(--accent-green,#4ade80)' : 'var(--text-muted)';
          return `<div class="card" style="cursor:pointer;padding:14px;border:2px solid ${active ? 'var(--accent-blue)' : 'transparent'};" onclick="selectProviderCallMarket(${escapeHtml(JSON.stringify(r.market))})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
              <strong style="font-size:0.95rem;">#${meta.market_rank ?? r.market_rank ?? ''} ${escapeHtml(r.market)}</strong>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:0.8rem;color:var(--text-secondary);">
              <span>Prospects: <strong>${r.prospects}</strong></span>
              <span>Priority 1: <strong>${r.priority_1}</strong></span>
              <span>Dialed: <strong>${r.dialed}</strong></span>
              <span>Live contact: <strong>${r.live_contact}</strong></span>
              <span>Surveys: <strong>${r.surveys_complete}</strong></span>
              <span>Wants Jordan: <strong>${r.wants_jordan}</strong></span>
              <span>Reach rate: <strong>${r.reach_rate_pct != null ? r.reach_rate_pct + '%' : '—'}</strong></span>
              <span>Survey rate: <strong>${r.survey_rate_pct != null ? r.survey_rate_pct + '%' : '—'}</strong></span>
            </div>
            <div style="margin-top:8px;font-size:0.78rem;color:${thresholdColor};font-weight:600;">${escapeHtml(r.threshold_label)}</div>
          </div>`;
        }).join('');
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(grid);

        if (!pclSelectedMarket && rollups.length) {
          selectProviderCallMarket(rollups[0].market);
        }
      } catch (e) {
        grid.innerHTML = `<p style="color:var(--accent-red);">Error loading rollup: ${escapeHtml(e.message)}</p>`;
      }
    }
    globalThis.loadProviderCallRollup = loadProviderCallRollup;

    // ------------------------------------------------------------------
    // 2026-09-04c — Survey Results & Trend. Tabulates the 9 fixed-choice
    // screening questions (S1/P1-P7/L1) and the interest rating into
    // breakdowns, surfaces the free-text verbatim answers (R1/R2/C1/etc.)
    // as a readable list, and shows a daily dialed/reached/surveyed trend.
    // Backed by GET /api/admin/provider-outreach/results — see
    // handleResults() in netlify/functions/admin-provider-outreach.js.
    // ------------------------------------------------------------------
    function pclPopulateResultsMarketFilter() {
      const sel = document.getElementById('pcl-results-market-filter');
      if (!sel) return;
      const current = sel.value;
      const sorted = (pclMarkets || []).slice().sort((a, b) => (a.market_rank ?? 0) - (b.market_rank ?? 0));
      sel.innerHTML = '<option value="">All Markets</option>' +
        sorted.map(m => `<option value="${escapeHtml(m.market)}">${escapeHtml(m.market)}</option>`).join('');
      if (sorted.some(m => m.market === current)) sel.value = current;
    }
    globalThis.pclPopulateResultsMarketFilter = pclPopulateResultsMarketFilter;

    async function loadProviderCallResults() {
      const body = document.getElementById('pcl-results-body');
      if (!body) return;
      const filterEl = document.getElementById('pcl-results-market-filter');
      const market = filterEl ? filterEl.value : '';
      body.innerHTML = '<p style="color:var(--text-muted);">Loading…</p>';
      try {
        const qs = market ? ('?market=' + encodeURIComponent(market)) : '';
        const res = await fetch('/api/admin/provider-outreach/results' + qs, { headers: pclHeaders() });
        if (!res.ok) {
          if ((res.status === 401 || res.status === 403) && typeof globalThis.renderAdminAuthError === 'function') {
            globalThis.renderAdminAuthError(body, Object.assign(new Error('Admin session rejected on Survey Results (HTTP ' + res.status + '). Sign in again.'), { code: 'ADMIN_AUTH_REJECTED' }), loadProviderCallResults);
            return;
          }
          body.innerHTML = `<p style="color:var(--accent-red);">Failed to load results (HTTP ${res.status}).</p>`;
          return;
        }
        const data = await res.json();
        body.innerHTML = pclResultsHtml(data);
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(body);
      } catch (e) {
        body.innerHTML = `<p style="color:var(--accent-red);">Error loading results: ${escapeHtml(e.message)}</p>`;
      }
    }
    globalThis.loadProviderCallResults = loadProviderCallResults;

    function pclBarBreakdown(options, total) {
      if (!options.length || !total) return '<p style="color:var(--text-muted);font-size:0.78rem;">No data.</p>';
      return options.map(o => {
        const pct = total > 0 ? Math.round((o.count / total) * 100) : 0;
        return `<div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);">
            <span>${escapeHtml(o.value)}</span><span>${o.count} (${pct}%)</span>
          </div>
          <div style="height:6px;background:var(--bg-elevated);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--accent-blue);border-radius:3px;"></div>
          </div>
        </div>`;
      }).join('');
    }

    function pclResultsHtml(data) {
      if (!data.prospects_counted) {
        return '<p style="color:var(--text-muted);">No prospects in this market yet.</p>';
      }

      let html = '';

      html += `<div style="margin-bottom:20px;">
        <h3 style="font-size:0.9rem;font-weight:600;margin:0 0 8px;">Daily Activity Trend</h3>`;
      if (!data.trend.length) {
        html += '<p style="color:var(--text-muted);font-size:0.85rem;">No calls logged yet — this fills in as attempts get logged.</p>';
      } else {
        html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><thead><tr>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Day</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Dialed</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Live Contact</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Surveys Complete</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Cumulative Surveys</th>
        </tr></thead><tbody>`;
        data.trend.forEach(d => {
          html += `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border-subtle);">${escapeHtml(d.day)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border-subtle);text-align:right;">${d.dialed}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border-subtle);text-align:right;">${d.live}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border-subtle);text-align:right;">${d.surveys}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:600;">${d.cumulative_surveys}</td>
          </tr>`;
        });
        html += '</tbody></table>';
      }
      html += '</div>';

      const ir = data.interest_rating;
      html += `<div style="margin-bottom:20px;">
        <h3 style="font-size:0.9rem;font-weight:600;margin:0 0 8px;">Interest Rating (1-5)</h3>`;
      if (!ir.n) {
        html += '<p style="color:var(--text-muted);font-size:0.85rem;">No ratings captured yet.</p>';
      } else {
        html += `<p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 8px;">Average: <strong>${ir.average}</strong> across ${ir.n} rated call${ir.n === 1 ? '' : 's'}</p>`;
        html += pclBarBreakdown([1, 2, 3, 4, 5].map(n => ({ value: String(n), count: ir.counts[String(n)] || 0 })), ir.n);
      }
      html += '</div>';

      html += `<div style="margin-bottom:20px;">
        <h3 style="font-size:0.9rem;font-weight:600;margin:0 0 8px;">Screening Question Breakdowns</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">`;
      data.question_breakdowns.forEach(q => {
        html += `<div>
          <div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;">${escapeHtml(q.label)}</div>`;
        if (!q.answered) {
          html += '<p style="color:var(--text-muted);font-size:0.78rem;">Not answered yet.</p>';
        } else {
          html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${q.answered} answered</div>`;
          html += pclBarBreakdown(q.options, q.answered);
        }
        html += '</div>';
      });
      html += '</div></div>';

      html += `<details>
        <summary style="cursor:pointer;font-size:0.9rem;font-weight:600;margin-bottom:8px;">Verbatim Answers (${data.free_text.length})</summary>
        <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-top:8px;">`;
      if (!data.free_text.length) {
        html += '<p style="color:var(--text-muted);font-size:0.85rem;">No verbatim answers captured yet.</p>';
      } else {
        data.free_text.forEach(ft => {
          html += `<div style="border-left:2px solid var(--border-subtle);padding-left:10px;">
            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(ft.label)} · ${escapeHtml(ft.business_name)} · ${escapeHtml(ft.market)}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(ft.value)}</div>
          </div>`;
        });
      }
      html += '</div></details>';

      return html;
    }
    globalThis.pclResultsHtml = pclResultsHtml;

    function selectProviderCallMarket(market) {
      pclSelectedMarket = market;
      document.querySelectorAll('#pcl-market-grid .card').forEach(c => c.style.border = '2px solid transparent');
      loadProviderCallRollup();
      renderProviderCallMarketContext(market);
      loadProviderCallProspects(market);
    }
    globalThis.selectProviderCallMarket = selectProviderCallMarket;

    function renderProviderCallMarketContext(market) {
      const card = document.getElementById('pcl-market-context-card');
      const title = document.getElementById('pcl-context-title');
      const body = document.getElementById('pcl-market-context');
      const meta = (pclMarkets || []).find(m => m.market === market);
      if (!card || !body || !meta) return;
      title.textContent = `Market context — ${meta.market}`;
      body.innerHTML = `
        <p><strong>Beachhead arc:</strong> ${escapeHtml(meta.beachhead_arc || '—')}</p>
        <p><strong>Regulatory context:</strong> ${escapeHtml(meta.regulatory_context || '—')}</p>
        <p><strong>How to play it:</strong> ${escapeHtml(meta.how_to_play_it || '—')}</p>
      `;
      card.style.display = 'block';
    }

    async function loadProviderCallProspects(market) {
      const wrap = document.getElementById('pcl-prospects-table');
      const card = document.getElementById('pcl-prospects-card');
      const title = document.getElementById('pcl-prospects-title');
      if (!wrap || !market) return;
      card.style.display = 'block';
      title.textContent = `Prospects — ${market}`;
      wrap.innerHTML = '<p style="color:var(--text-muted);padding:16px 0;">Loading…</p>';
      try {
        const res = await fetch('/api/admin/provider-outreach/prospects?market=' + encodeURIComponent(market), { headers: pclHeaders() });
        if (!res.ok) { wrap.innerHTML = `<p style="color:var(--accent-red);">Failed to load prospects (HTTP ${res.status}).</p>`; return; }
        const data = await res.json();
        pclProspects = data.prospects || [];
        renderProviderCallProspectsTable();
      } catch (e) {
        wrap.innerHTML = `<p style="color:var(--accent-red);">Error: ${escapeHtml(e.message)}</p>`;
      }
    }
    globalThis.loadProviderCallProspects = loadProviderCallProspects;

    function renderProviderCallProspectsTable() {
      const wrap = document.getElementById('pcl-prospects-table');
      if (!wrap) return;
      if (!pclProspects.length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);padding:16px 0;">No prospects in this market.</p>';
        return;
      }
      let html = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;"><thead><tr>';
      ['#', 'Priority', 'Business', 'City', 'Phone', 'Rating', 'Contact', 'Outcome', ''].forEach(h => {
        html += `<th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;white-space:nowrap;">${h}</th>`;
      });
      html += '</tr></thead><tbody>';
      pclProspects.forEach(p => {
        const isEditing = pclEditingId === p.id;
        // 2026-09-04d — a completed survey locks so a second caller can't
        // reopen it (and see a provider is receptive) or clobber the first
        // caller's answers. adminTeamToken is only set for a team-login
        // session (e.g. Maria's marketing role) — Jordan's own super_admin
        // login never sets it — so it doubles as "am I allowed to override
        // the lock" without a separate round trip.
        const isLocked = !!p.locked;
        const lockedForMe = isLocked && !!adminTeamToken;
        const logCallCell = lockedForMe
          ? '<span style="color:var(--text-muted);font-size:0.8rem;white-space:nowrap;" title="Survey complete — locked. Ask Jordan to make changes.">🔒 Completed</span>'
          : `<button class="btn btn-sm" onclick="togglePclCallLog(${escapeHtml(JSON.stringify(p.id))})">${isEditing ? 'Close' : (isLocked ? 'Edit (Admin)' : 'Log Call')}</button>`;
        html += `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);">${p.row_number}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);">${pclPriorityChip(p.priority)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);">
            <div style="font-weight:600;">${escapeHtml(p.business_name)}</div>
            <div style="color:var(--text-muted);font-size:0.78rem;">${escapeHtml(p.segment || '')}${p.screening_flags ? ' · ⚠ ' + escapeHtml(p.screening_flags) : ''}</div>
            <div style="color:var(--text-muted);font-size:0.78rem;max-width:320px;">${escapeHtml(p.why_this_one || '')}</div>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);white-space:nowrap;">${escapeHtml(p.city || '')}${p.county ? ', ' + escapeHtml(p.county) : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);white-space:nowrap;">${escapeHtml(p.phone || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);white-space:nowrap;">${p.google_rating ?? '—'} (${p.review_count ?? 0})</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);">${escapeHtml(p.contact_name || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);max-width:180px;">${escapeHtml(p.outcome || 'Not attempted')}${isLocked ? ' 🔒' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);white-space:nowrap;">
            ${logCallCell}
          </td>
        </tr>`;
        if (isEditing) {
          html += pclCallLogRowHtml(p);
        }
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(wrap);
    }

    function pclField(id, label, value, width) {
      return `<label style="display:flex;flex-direction:column;gap:3px;font-size:0.75rem;color:var(--text-muted);${width ? 'width:' + width + ';' : ''}">${label}
        <input id="${id}" value="${escapeHtml(value ?? '')}" style="padding:6px 8px;border:1px solid var(--border-subtle);border-radius:4px;background:var(--bg-elevated);color:var(--text-primary);font-size:0.85rem;">
      </label>`;
    }

    function pclSelectField(id, label, value, options, width) {
      const opts = ['<option value="">—</option>'].concat(options.map(o =>
        `<option value="${escapeHtml(o)}"${value === o ? ' selected' : ''}>${escapeHtml(o)}</option>`
      )).join('');
      return `<label style="display:flex;flex-direction:column;gap:3px;font-size:0.75rem;color:var(--text-muted);${width ? 'width:' + width + ';' : ''}">${label}
        <select id="${id}" style="padding:6px 8px;border:1px solid var(--border-subtle);border-radius:4px;background:var(--bg-elevated);color:var(--text-primary);font-size:0.85rem;">${opts}</select>
      </label>`;
    }

    const PCL_S1_OPTIONS = ['Mobile only', 'Shop + mobile', 'Shop only', 'Would consider mobile'];
    const PCL_P1_OPTIONS = ['Word of mouth', 'Google', 'online ads', 'Repeat only', 'Social media', 'Walk-ins', 'location', 'Paid lead platform'];
    const PCL_P2_OPTIONS = ['Phone only', 'Text', 'messaging', 'Online booking', 'Walk-in', 'first come', 'Mix of phone + text'];
    const PCL_P3_OPTIONS = ['Paid ads', 'Asked for referrals', 'Tried a lead-gen platform', 'Discounts', 'promos', "Nothing — haven't tried"];
    const PCL_P4_OPTIONS = ['Good experience', 'Got burned', 'quit', 'Mixed results', 'Never used one', 'Heard of them — avoided'];
    const PCL_P5_OPTIONS = ['Bigger repair jobs', 'Repeat', 'loyal', "Don't haggle", 'Specific vehicle types', 'Local', 'nearby', 'Fleet', 'commercial'];
    const PCL_P6_OPTIONS = ['$0', 'Under $100', '$100–500', '$500–1500', '$1500+', "Wouldn't say"];
    const PCL_P7_OPTIONS = ['Mornings', 'Mid-week', 'Weekends', 'Seasonal', 'winter', 'Booked solid'];
    const PCL_L1_OPTIONS = ['Big effect — describe', 'Some effect', 'No effect', "Hadn't thought about it", 'Not set up for it'];
    const PCL_INTEREST_OPTIONS = ['1', '2', '3', '4', '5'];

    function pclSectionLabel(text) {
      return `<div style="font-weight:600;font-size:0.8rem;margin-top:14px;margin-bottom:2px;color:var(--text-primary);">${text}</div>`;
    }

    function pclCallLogRowHtml(p) {
      const iv = p.interest_rating != null ? String(p.interest_rating) : '';
      const lockNotice = p.locked
        ? `<div style="margin-bottom:12px;padding:8px 10px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-muted);font-size:0.78rem;">🔒 This survey is marked complete and is locked for other callers — you're editing it as super admin.</div>`
        : '';
      return `<tr id="pcl-edit-row-${p.id}"><td colspan="9" style="padding:14px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);">
        ${lockNotice}
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${pclField('pcl-f-contact_name-' + p.id, 'Contact Name', p.contact_name, '160px')}
          ${pclField('pcl-f-attempt_1-' + p.id, 'Attempt 1 (date)', p.attempt_1, '130px')}
          ${pclField('pcl-f-attempt_2-' + p.id, 'Attempt 2 (date)', p.attempt_2, '130px')}
          ${pclField('pcl-f-attempt_3-' + p.id, 'Attempt 3 (date)', p.attempt_3, '130px')}
          ${pclField('pcl-f-outcome-' + p.id, 'Outcome', p.outcome, '220px')}
        </div>

        ${pclSectionLabel('Screen + Core')}
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${pclSelectField('pcl-f-s1_operating_model-' + p.id, 'S1 Mobile / shop / both', p.s1_operating_model, PCL_S1_OPTIONS, '190px')}
          ${pclSelectField('pcl-f-p1_how_found-' + p.id, 'P1 How new customers find them', p.p1_how_found, PCL_P1_OPTIONS, '190px')}
          ${pclSelectField('pcl-f-p2_booking_process-' + p.id, 'P2 First call → job done', p.p2_booking_process, PCL_P2_OPTIONS, '190px')}
          ${pclField('pcl-f-p2_where_lose_jobs-' + p.id, 'P2 probe: where they lose jobs', p.p2_where_lose_jobs, '220px')}
          ${pclSelectField('pcl-f-p3_growth_attempts-' + p.id, 'P3 What they tried for more work', p.p3_growth_attempts, PCL_P3_OPTIONS, '190px')}
          ${pclField('pcl-f-p3_attempt_cost-' + p.id, 'P3 probe: did it work / cost', p.p3_attempt_cost, '220px')}
          ${pclSelectField('pcl-f-p4_platform_experience-' + p.id, 'P4 Paid-lead-platform experience', p.p4_platform_experience, PCL_P4_OPTIONS, '190px')}
          ${pclField('pcl-f-p4b_which_platforms-' + p.id, 'P4b Which platform(s)', p.p4b_which_platforms, '190px')}
          ${pclSelectField('pcl-f-p5_ideal_customer-' + p.id, 'P5 Job/customer they want more of', p.p5_ideal_customer, PCL_P5_OPTIONS, '190px')}
          ${pclField('pcl-f-p5_not_worth_time-' + p.id, 'P5 probe: not worth their time', p.p5_not_worth_time, '220px')}
          ${pclSelectField('pcl-f-p6_monthly_spend-' + p.id, 'P6 Monthly spend on new customers', p.p6_monthly_spend, PCL_P6_OPTIONS, '190px')}
          ${pclSelectField('pcl-f-p7_slowest_time-' + p.id, 'P7 Slowest time of week', p.p7_slowest_time, PCL_P7_OPTIONS, '190px')}
          ${pclSelectField('pcl-f-l1_regulatory_impact-' + p.id, 'L1 Regulatory cycle impact', p.l1_regulatory_impact, PCL_L1_OPTIONS, '190px')}
          ${pclField('pcl-f-l1_detail-' + p.id, 'L1 detail (if Big effect)', p.l1_detail, '220px')}
        </div>

        ${pclSectionLabel('Reaction')}
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${pclField('pcl-f-r1_first_reaction-' + p.id, 'R1 First thing that comes to mind (verbatim)', p.r1_first_reaction, '260px')}
          ${pclField('pcl-f-r2_first_worry-' + p.id, 'R2 First thing that worries them (verbatim)', p.r2_first_worry, '260px')}
        </div>

        ${pclSectionLabel('Price Test')}
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${pclField('pcl-f-b1_send_bid-' + p.id, 'B1 Send a bid at $10?', p.b1_send_bid, '140px')}
          ${pclField('pcl-f-b2_fair_price-' + p.id, 'B2 Fair price ($)', p.b2_fair_price, '110px')}
          ${pclField('pcl-f-b2_price_unit-' + p.id, 'B2b Price unit', p.b2_price_unit, '150px')}
          ${pclField('pcl-f-b3_bid_style-' + p.id, 'B3 Bid style', p.b3_bid_style, '150px')}
          ${pclField('pcl-f-r3_yes_reason-' + p.id, 'R3 What makes it a YES', p.r3_yes_reason, '260px')}
          ${pclField('pcl-f-r3_no_reason-' + p.id, 'R3 What makes it a NO', p.r3_no_reason, '260px')}
        </div>

        ${pclSectionLabel('Close')}
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${pclField('pcl-f-c1_referral-' + p.id, 'C1 Who else should Maria call', p.c1_referral, '260px')}
          ${pclField('pcl-f-bid_pack_pitched-' + p.id, 'Bid pack pitched?', p.bid_pack_pitched, '140px')}
          ${pclField('pcl-f-bid_pack_decline_reason-' + p.id, 'Why not (if declined)', p.bid_pack_decline_reason, '220px')}
          ${pclField('pcl-f-what_they_said-' + p.id, 'What they said to it', p.what_they_said, '260px')}
          ${pclField('pcl-f-c2_first_refusal-' + p.id, 'C2 First refusal', p.c2_first_refusal, '160px')}
          ${pclSelectField('pcl-f-interest_rating-' + p.id, 'Interest (1-5)', iv, PCL_INTEREST_OPTIONS, '100px')}
          ${pclField('pcl-f-notes-' + p.id, 'Notes', p.notes, '260px')}
        </div>

        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-sm btn-primary" onclick="savePclCallLog(${escapeHtml(JSON.stringify(p.id))})"><span class="icon-inline" data-icon="save"></span> Save</button>
          <button class="btn btn-sm" onclick="togglePclCallLog(${escapeHtml(JSON.stringify(p.id))})">Cancel</button>
        </div>
      </td></tr>`;
    }

    function togglePclCallLog(id) {
      pclEditingId = pclEditingId === id ? null : id;
      renderProviderCallProspectsTable();
    }
    globalThis.togglePclCallLog = togglePclCallLog;

    const PCL_EDITABLE_FIELDS = [
      'contact_name', 'attempt_1', 'attempt_2', 'attempt_3', 'outcome',
      's1_operating_model', 'p1_how_found', 'p2_booking_process', 'p2_where_lose_jobs',
      'p3_growth_attempts', 'p3_attempt_cost', 'p4_platform_experience', 'p4b_which_platforms',
      'p5_ideal_customer', 'p5_not_worth_time', 'p6_monthly_spend', 'p7_slowest_time',
      'l1_regulatory_impact', 'l1_detail',
      'r1_first_reaction', 'r2_first_worry',
      'b1_send_bid', 'b2_fair_price', 'b2_price_unit', 'b3_bid_style',
      'r3_yes_reason', 'r3_no_reason',
      'c1_referral', 'bid_pack_pitched', 'bid_pack_decline_reason', 'what_they_said',
      'c2_first_refusal', 'interest_rating', 'notes'
    ];

    async function savePclCallLog(id) {
      const payload = {};
      PCL_EDITABLE_FIELDS.forEach(f => {
        const el = document.getElementById('pcl-f-' + f + '-' + id);
        if (el) payload[f] = el.value === '' ? null : el.value;
      });
      if (payload.b2_fair_price != null) {
        const n = Number(payload.b2_fair_price);
        payload.b2_fair_price = Number.isFinite(n) ? n : null;
      }
      if (payload.interest_rating != null) {
        const n = Number(payload.interest_rating);
        payload.interest_rating = Number.isFinite(n) ? n : null;
      }
      try {
        const res = await fetch('/api/admin/provider-outreach/prospects/' + encodeURIComponent(id), {
          method: 'PUT', headers: pclHeaders(), body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('Call logged');
        pclEditingId = null;
        await loadProviderCallProspects(pclSelectedMarket);
        await loadProviderCallRollup();
      } catch (e) {
        showToast('Failed to save: ' + e.message, 'error');
      }
    }
    globalThis.savePclCallLog = savePclCallLog;

    async function generateSocialPosts() {
      const topic = document.getElementById('social-topic').value;
      if (!topic) { showToast('Please enter a topic', 'error'); return; }
      const platforms = [];
      document.querySelectorAll('.social-platform-cb:checked').forEach(cb => platforms.push(cb.value));
      if (platforms.length === 0) { showToast('Select at least one platform', 'error'); return; }
      const tone = document.getElementById('social-tone').value;
      const audience = document.getElementById('social-audience').value;
      const context = document.getElementById('social-context').value;
      const btn = document.getElementById('social-generate-btn');
      const output = document.getElementById('social-posts-output');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      output.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Creating platform-optimized posts...</div>';
      try {
        const res = await fetch('/api/admin/marketing/generate', {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({
            type: 'social_post',
            topic,
            tone,
            audience,
            context: `Generate SEPARATE optimized posts for each of these platforms: ${platforms.join(', ')}. For each platform, follow its specific best practices:\n- Twitter/X: Max 280 characters, punchy, 2-3 relevant hashtags\n- Facebook: Conversational, can be longer (1-2 paragraphs), include a call to action, 3-5 hashtags\n- Instagram: Visual-focused caption, storytelling tone, 10-15 relevant hashtags at the end, include emoji\n- LinkedIn: Professional tone, thought leadership angle, 3-5 hashtags\n\nFormat your response with clear headers for each platform like:\n\n## X (Twitter)\n[post content]\n\n## Facebook\n[post content]\n\n## Instagram\n[post content]\n\n## LinkedIn\n[post content]\n\nAdditional context: ${context || 'None'}`,
            platform: 'general'
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const content = data.content || data.result || '';
        const platformConfigs = {
          twitter: { name: 'X (Twitter)', icon: 'message-circle', color: '#1DA1F2', maxChars: 280 },
          facebook: { name: 'Facebook', icon: 'thumbs-up', color: '#1877F2', maxChars: null },
          instagram: { name: 'Instagram', icon: 'camera', color: '#E4405F', maxChars: null },
          linkedin: { name: 'LinkedIn', icon: 'briefcase', color: '#0A66C2', maxChars: null }
        };
        const sections = content.split(/##\s+/);
        let html = '';
        platforms.forEach(p => {
          const cfg = platformConfigs[p];
          let postContent = '';
          for (const sec of sections) {
            const lower = sec.toLowerCase();
            if ((p === 'twitter' && (lower.startsWith('x (twitter)') || lower.startsWith('twitter') || lower.startsWith('x\n'))) ||
                (p === 'facebook' && lower.startsWith('facebook')) ||
                (p === 'instagram' && lower.startsWith('instagram')) ||
                (p === 'linkedin' && lower.startsWith('linkedin'))) {
              postContent = sec.replace(/^[^\n]+\n/, '').trim();
              break;
            }
          }
          if (!postContent) postContent = content;
          const charInfo = cfg.maxChars ? ` <span style="color:${postContent.length > cfg.maxChars ? 'var(--accent-red)' : 'var(--text-muted)'};font-size:0.8rem;">${postContent.length}/${cfg.maxChars}</span>` : '';
          html += `<div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);">
              <div style="display:flex;align-items:center;gap:8px;"><span style="width:10px;height:10px;border-radius:50%;background:${cfg.color};display:inline-block;"></span><strong>${cfg.name}</strong>${charInfo}</div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-sm" onclick="copySocialPost('${p}')"><span class="icon-inline" data-icon="clipboard"></span> Copy</button>
                <button class="btn btn-sm" onclick="saveSocialPost('${p}')"><span class="icon-inline" data-icon="bookmark"></span> Save</button>
              </div>
            </div>
            <div id="social-post-${p}" style="padding:16px;white-space:pre-wrap;font-size:0.95rem;line-height:1.6;color:var(--text-primary);">${postContent}</div>
          </div>`;
        });
        output.innerHTML = html;
      } catch(e) {
        output.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:40px;">Error: ${e.message}</p>`;
      }
      btn.disabled = false;
      btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate Posts for All Platforms';
    }
    globalThis.generateSocialPosts = generateSocialPosts;

    function copySocialPost(platform) {
      const el = document.getElementById('social-post-' + platform);
      if (el) { navigator.clipboard.writeText(el.textContent); showToast('Copied ' + platform + ' post'); }
    }
    globalThis.copySocialPost = copySocialPost;

    function copyAllSocialPosts() {
      const posts = [];
      document.querySelectorAll('[id^="social-post-"]').forEach(el => {
        const platform = el.id.replace('social-post-', '').toUpperCase();
        posts.push(`--- ${platform} ---\n${el.textContent}`);
      });
      if (posts.length) { navigator.clipboard.writeText(posts.join('\n\n')); showToast('All posts copied'); }
    }
    globalThis.copyAllSocialPosts = copyAllSocialPosts;

    function saveSocialPost(platform) {
      const el = document.getElementById('social-post-' + platform);
      if (!el) return;
      const saved = JSON.parse(localStorage.getItem('mcc_social_posts') || '[]');
      saved.unshift({ platform, content: el.textContent, date: new Date().toISOString() });
      if (saved.length > 50) saved.length = 50;
      localStorage.setItem('mcc_social_posts', JSON.stringify(saved));
      showToast('Post saved to history');
    }
    globalThis.saveSocialPost = saveSocialPost;

    function loadSocialPostHistory() {
      const container = document.getElementById('social-post-history');
      if (!container) return;
      const saved = JSON.parse(localStorage.getItem('mcc_social_posts') || '[]');
      if (!saved.length) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No posts saved yet.</p>'; return; }
      const platformColors = { twitter: '#1DA1F2', facebook: '#1877F2', instagram: '#E4405F', linkedin: '#0A66C2' };
      const platformNames = { twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
      container.innerHTML = saved.map((p, i) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;border-bottom:1px solid var(--border-subtle);${i === saved.length - 1 ? 'border:none;' : ''}">
        <span style="width:10px;height:10px;border-radius:50%;background:${platformColors[p.platform] || '#888'};flex-shrink:0;margin-top:6px;"></span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:0.85rem;">${platformNames[p.platform] || p.platform}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted);">${new Date(p.date).toLocaleDateString()}</span>
          </div>
          <div style="font-size:0.9rem;color:var(--text-secondary);white-space:pre-wrap;max-height:80px;overflow:hidden;text-overflow:ellipsis;">${p.content.substring(0, 200)}${p.content.length > 200 ? '...' : ''}</div>
        </div>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(${escapeHtml(JSON.stringify(p.content).replaceAll('\'', "\\'"))}); showToast('Copied');"><span class="icon-inline" data-icon="clipboard"></span></button>
      </div>`).join('');
    }
    globalThis.loadSocialPostHistory = loadSocialPostHistory;

    function updatePlatformVisibility() {
      const type = document.getElementById('mkt-content-type')?.value;
      const platformWrap = document.getElementById('mkt-platform-wrap');
      if (platformWrap) {
        platformWrap.style.display = (type === 'social_post' || type === 'ad_copy') ? 'block' : 'none';
      }
    }
    if (document.getElementById('mkt-content-type')) {
      document.getElementById('mkt-content-type').addEventListener('change', updatePlatformVisibility);
    }

    async function initMarketingHub() {
      updatePlatformVisibility();
      await loadSavedCampaigns();
      // Task #139 — Hunter & Promoter activity strip at top of section.
      // 2026-09-04 (decluttering): this used to render eagerly here, which
      // meant every visit to Marketing & Outreach fetched and drew up to
      // ~30 full activity cards (each with its own "Show details" drawer)
      // whether or not anyone looked at them. It now lives behind a
      // collapsed <details> (see www/admin.html) and only fetches/renders
      // the first time it's actually expanded.
      const moActivityDetails = document.getElementById('mo-agent-activity-details');
      if (moActivityDetails && !moActivityDetails.__aapBound) {
        moActivityDetails.__aapBound = true;
        moActivityDetails.addEventListener('toggle', () => {
          if (!moActivityDetails.open || moActivityDetails.__aapLoaded) return;
          moActivityDetails.__aapLoaded = true;
          if (typeof globalThis.renderAgentActivityPanel === 'function') {
            try { globalThis.renderAgentActivityPanel('mo-agent-activity', {
              // title left blank — the <summary> above already labels this
              // section, no need to repeat it inside the expanded panel.
              agentSlug: ['hunter', 'promoter'], limit: 15,
              title: '', showEmpty: true,
              linkContext: { section: 'marketing-outreach' }
            }); } catch (e) { console.warn('[admin] marketing agent panel failed:', e); }
          }
        });
      }
      // Task #222 — Launch broadcast send progress + bounces.
      try { await loadLaunchBroadcastStats(); }
      catch (e) { console.warn('[admin] loadLaunchBroadcastStats failed:', e); }
    }

    // Task #222 — Launch broadcast dashboard card.
    // (escapeHtml is already defined at the top of this IIFE.)
    async function loadLaunchBroadcastStats() {
      const summary = document.getElementById('launch-broadcast-summary');
      const grid    = document.getElementById('launch-broadcast-grid');
      const lastEl  = document.getElementById('launch-broadcast-last-send');
      const list    = document.getElementById('launch-broadcast-bounces');
      const countEl = document.getElementById('launch-broadcast-bounces-count');
      if (!summary || !grid || !list) return;
      summary.textContent = 'Loading…';
      grid.innerHTML = '';
      list.innerHTML = '';
      if (lastEl) lastEl.textContent = '';
      if (countEl) countEl.textContent = '';

      try {
        const [statsRes, bouncesRes] = await Promise.all([
          fetch('/api/admin/launch-broadcast/stats',         { headers: getAdminHeaders() }),
          fetch('/api/admin/launch-broadcast/bounces?limit=50', { headers: getAdminHeaders() })
        ]);

        if (!statsRes.ok) {
          // Task #355 — auth failures route through the shared "Sign in again"
          // prompt instead of a dead-end status string.
          if ((statsRes.status === 401 || statsRes.status === 403) && typeof globalThis.renderAdminAuthError === 'function') {
            const err = new Error(`Admin session rejected on /api/admin/launch-broadcast-stats (HTTP ${statsRes.status}). Sign in again.`);
            err.code = 'ADMIN_AUTH_REJECTED';
            globalThis.renderAdminAuthError(summary, err, loadLaunchBroadcastStats);
          } else {
            summary.textContent = `Failed to load stats (HTTP ${statsRes.status}).`;
          }
          return;
        }
        const stats = await statsRes.json();
        if (stats.table_missing) {
          summary.textContent = stats.error || 'No launch broadcast data yet.';
          return;
        }
        if (stats.error) {
          summary.textContent = `Error loading stats: ${stats.error}`;
          return;
        }

        const t = Object.assign({ queued:0, sent:0, bounced:0, complained:0, failed:0, total:0 }, stats.totals || {});
        const unsubs = stats.unsubscribes_total || 0;
        const bounceRate = t.sent > 0 ? ((t.bounced / t.sent) * 100).toFixed(2) : '0.00';
        summary.innerHTML =
          `<strong>${t.total.toLocaleString()}</strong> rows logged · ` +
          `<strong>${t.queued.toLocaleString()}</strong> queued · ` +
          `<strong style="color:var(--accent-green,#4ade80);">${t.sent.toLocaleString()}</strong> sent · ` +
          `<strong style="color:var(--accent-red,#ef4444);">${t.bounced.toLocaleString()}</strong> bounced (${bounceRate}% of sent) · ` +
          `<strong style="color:var(--accent-orange,#f59e0b);">${t.complained.toLocaleString()}</strong> complained · ` +
          `<strong>${t.failed.toLocaleString()}</strong> failed · ` +
          `<strong>${unsubs.toLocaleString()}</strong> on suppression list`;

        if (lastEl && stats.last_send_at) {
          const d = new Date(stats.last_send_at);
          lastEl.textContent = `Last send: ${d.toLocaleString()}`;
        }

        const audiences = stats.audiences || {};
        const audKeys = Object.keys(audiences);
        const cells = [];
        for (const aud of audKeys) {
          const a = Object.assign({ queued:0, sent:0, bounced:0, complained:0, failed:0, total:0 }, audiences[aud] || {});
          cells.push(
            `<div class="stat-card">
              <div class="stat-label" style="text-transform:capitalize;">${escapeHtml(aud)}</div>
              <div class="stat-value">${a.sent.toLocaleString()}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
                queued ${a.queued} · bounced ${a.bounced} · complained ${a.complained} · failed ${a.failed}
              </div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">total logged ${a.total}</div>
            </div>`
          );
        }
        grid.innerHTML = cells.join('') || '<div style="padding:8px;color:var(--text-muted);">No audience data.</div>';

        if (!bouncesRes.ok) {
          // Task #355 — auth-expiry surfaces the shared "Sign in again" prompt.
          if ((bouncesRes.status === 401 || bouncesRes.status === 403)) {
            const err = new Error(`Admin session rejected on /api/admin/launch-broadcast/bounces (HTTP ${bouncesRes.status}). Sign in again.`);
            err.code = 'ADMIN_AUTH_REJECTED';
            renderAdminAuthErrorInto(list, err, loadLaunchBroadcastStats);
          } else {
            list.innerHTML = `<div style="padding:12px;color:var(--text-muted);">Failed to load bounces (HTTP ${bouncesRes.status}).</div>`;
          }
          return;
        }
        const bounces = await bouncesRes.json();
        const rows = bounces.rows || [];
        if (countEl) countEl.textContent = `${rows.length} shown`;
        if (rows.length === 0) {
          list.innerHTML = '<div style="padding:12px;color:var(--text-muted);">No bounces or complaints yet.</div>';
          return;
        }
        const statusColor = (s) => s === 'bounced' ? 'var(--accent-red,#ef4444)'
          : s === 'complained' ? 'var(--accent-orange,#f59e0b)'
          : 'var(--text-muted)';
        list.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead style="position:sticky;top:0;background:var(--bg-elevated,#1e2530);">
              <tr>
                <th style="text-align:left;padding:8px;">Email</th>
                <th style="text-align:left;padding:8px;">Audience</th>
                <th style="text-align:left;padding:8px;">Status</th>
                <th style="text-align:left;padding:8px;">Reason</th>
                <th style="text-align:left;padding:8px;">When</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:8px;font-family:monospace;">${escapeHtml(r.email)}</td>
                  <td style="padding:8px;text-transform:capitalize;">${escapeHtml(r.audience || '')}</td>
                  <td style="padding:8px;color:${statusColor(r.status)};text-transform:capitalize;">${escapeHtml(r.status || '')}</td>
                  <td style="padding:8px;color:var(--text-muted);">${escapeHtml(r.error_message || '—')}</td>
                  <td style="padding:8px;color:var(--text-muted);white-space:nowrap;">${r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>`;
      } catch (err) {
        console.error('loadLaunchBroadcastStats error:', err);
        summary.textContent = `Error: ${err.message || err}`;
      }
    }
    globalThis.loadLaunchBroadcastStats = loadLaunchBroadcastStats;

    function getMarketingHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (_adminBearer) headers['Authorization'] = 'Bearer ' + _adminBearer;
      if (adminTeamToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + adminTeamToken;
      return headers;
    }

    // Task #243 — Facebook Page connection picker lives in admin-outreach.js
    // (renderFacebookPageCard / initFacebookPageConnection) and is auto-loaded
    // when the Marketing & Outreach panel becomes visible. Do not add a second
    // renderer here.
    async function generateMarketingContent() {
      const type = document.getElementById('mkt-content-type').value;
      const platform = document.getElementById('mkt-platform').value;
      const topic = document.getElementById('mkt-topic').value;
      const tone = document.getElementById('mkt-tone').value;
      const audience = document.getElementById('mkt-audience').value;
      const context = document.getElementById('mkt-context').value;
      if (!topic) { showToast('Please enter a topic', 'error'); return; }
      const output = document.getElementById('mkt-output');
      const btn = document.getElementById('mkt-generate-btn');
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px;"></span> Generating...';
      output.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> AI is crafting your content...</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type, platform, topic, tone, targetAudience: audience, additionalContext: context })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentMktContent = data.content;
        output.textContent = data.content;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate Content';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    globalThis.generateMarketingContent = generateMarketingContent;

    function copyMarketingContent() {
      if (!currentMktContent) { showToast('No content to copy', 'error'); return; }
      navigator.clipboard.writeText(currentMktContent).then(() => showToast('Content copied to clipboard'));
    }
    globalThis.copyMarketingContent = copyMarketingContent;

    async function saveMarketingContent() {
      if (!currentMktContent) { showToast('No content to save', 'error'); return; }
      const type = document.getElementById('mkt-content-type').value;
      const topic = document.getElementById('mkt-topic').value;
      await saveCampaignToServer(topic || 'Untitled', type, currentMktContent, { platform: document.getElementById('mkt-platform').value });
    }
    globalThis.saveMarketingContent = saveMarketingContent;

    async function generateEmailCampaign() {
      const campaignType = document.getElementById('email-campaign-type').value;
      const subjectTopic = document.getElementById('email-subject-topic').value;
      const keyMessage = document.getElementById('email-key-message').value;
      if (!subjectTopic) { showToast('Please enter a subject topic', 'error'); return; }
      const preview = document.getElementById('email-preview');
      preview.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:#999;"><div style="width:32px;height:32px;border:3px solid #ddd;border-top-color:#007bff;border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">Generating email...</p></div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type: 'email_campaign', topic: campaignType + ': ' + subjectTopic, tone: 'professional', targetAudience: 'car_owners', additionalContext: keyMessage || '' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentEmailHtml = data.content;
        const subjectMatch = data.content.match(/Subject:\s*(.+?)(?:\n|<)/i);
        currentEmailSubject = subjectMatch ? subjectMatch[1].trim() : subjectTopic;
        preview.innerHTML = data.content;
        document.getElementById('email-subject-preview').style.display = 'block';
        document.getElementById('email-subject-text').textContent = currentEmailSubject;
      } catch (err) {
        preview.innerHTML = '<p style="color:red;padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    globalThis.generateEmailCampaign = generateEmailCampaign;

    async function sendEmailCampaign() {
      if (!currentEmailHtml) { showToast('Generate an email first', 'error'); return; }
      const recipientText = document.getElementById('email-recipients').value;
      if (!recipientText.trim()) { showToast('Enter recipient emails', 'error'); return; }
      const recipients = recipientText.split(',').map(e => e.trim()).filter(e => e.includes('@'));
      if (recipients.length === 0) { showToast('No valid email addresses', 'error'); return; }
      if (recipients.length > 50) { showToast('Maximum 50 recipients per send', 'error'); return; }
      const btn = document.getElementById('email-send-btn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/send-email`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ to: recipients, subject: currentEmailSubject, html: currentEmailHtml, fromName: 'My Car Concierge' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast('Email sent to ' + (data.sent || recipients.length) + ' recipient(s)');
      } catch (err) {
        showToast('Failed to send: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Campaign';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    globalThis.sendEmailCampaign = sendEmailCampaign;

    function copyEmailContent() {
      if (!currentEmailHtml) { showToast('No email to copy', 'error'); return; }
      navigator.clipboard.writeText(currentEmailHtml).then(() => showToast('Email HTML copied'));
    }
    globalThis.copyEmailContent = copyEmailContent;

    function saveEmailCampaign() {
      if (!currentEmailHtml) { showToast('No email to save', 'error'); return; }
      saveCampaignToServer(currentEmailSubject || 'Email Campaign', 'email_campaign', currentEmailHtml, {});
    }
    globalThis.saveEmailCampaign = saveEmailCampaign;

    async function generateStrategy() {
      const goal = document.getElementById('strategy-goal').value;
      const budget = document.getElementById('strategy-budget').value;
      const timeline = document.getElementById('strategy-timeline').value;
      const channels = Array.from(document.querySelectorAll('.strategy-channel:checked')).map(c => c.value);
      if (!goal) { showToast('Please enter a goal', 'error'); return; }
      const output = document.getElementById('strategy-output');
      output.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> AI is building your strategy...</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/strategy`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ goal, budget: budget || 'Not specified', timeline, channels })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Strategy generation failed');
        currentStrategyContent = data.strategy;
        output.textContent = data.strategy;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    globalThis.generateStrategy = generateStrategy;

    function copyStrategyContent() {
      if (!currentStrategyContent) { showToast('No strategy to copy', 'error'); return; }
      navigator.clipboard.writeText(currentStrategyContent).then(() => showToast('Strategy copied'));
    }
    globalThis.copyStrategyContent = copyStrategyContent;

    function saveStrategyContent() {
      if (!currentStrategyContent) { showToast('No strategy to save', 'error'); return; }
      saveCampaignToServer(document.getElementById('strategy-goal').value || 'Marketing Strategy', 'campaign_strategy', currentStrategyContent, {});
    }
    globalThis.saveStrategyContent = saveStrategyContent;

    async function generateFundraising() {
      const type = document.getElementById('fund-type').value;
      const goal = document.getElementById('fund-goal').value;
      const differentiators = document.getElementById('fund-differentiators').value;
      const stage = document.getElementById('fund-stage').value;
      if (!goal) { showToast('Please enter a funding goal', 'error'); return; }
      const output = document.getElementById('fund-output');
      output.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> AI is generating fundraising content...</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type, topic: goal, tone: 'professional', targetAudience: 'investors', additionalContext: 'Stage: ' + stage + '. ' + (differentiators || '') })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentFundContent = data.content;
        output.textContent = data.content;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    globalThis.generateFundraising = generateFundraising;

    function copyFundraisingContent() {
      if (!currentFundContent) { showToast('No content to copy', 'error'); return; }
      navigator.clipboard.writeText(currentFundContent).then(() => showToast('Content copied'));
    }
    globalThis.copyFundraisingContent = copyFundraisingContent;

    function saveFundraisingContent() {
      if (!currentFundContent) { showToast('No content to save', 'error'); return; }
      saveCampaignToServer(document.getElementById('fund-goal').value || 'Fundraising Content', document.getElementById('fund-type').value, currentFundContent, { stage: document.getElementById('fund-stage').value });
    }
    globalThis.saveFundraisingContent = saveFundraisingContent;

    async function saveCampaignToServer(title, type, content, metadata) {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/save-campaign`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ title, type, content, metadata })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        showToast('Content saved successfully');
      } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
      }
    }

    async function loadSavedCampaigns() {
      const container = document.getElementById('saved-campaigns-list');
      if (!container) return;
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/saved-campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const campaigns = data.campaigns || [];
        if (campaigns.length === 0) {
          container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No saved content yet. Generate and save content from other tabs.</p>';
          return;
        }
        const typeLabels = { social_post: 'Social Post', email_campaign: 'Email Campaign', ad_copy: 'Ad Copy', blog_outline: 'Blog Outline', outreach_email: 'Outreach Email', press_release: 'Press Release', kickstarter_campaign: 'Crowdfunding', grant_application: 'Grant Application', investor_pitch: 'Investor Pitch', funding_research: 'Funding Research', campaign_strategy: 'Strategy' };
        container.innerHTML = campaigns.map(c => {
          const safeContent = escapeHtml(c.content);
          return '<div style="padding:16px;border-bottom:1px solid var(--border-subtle);cursor:pointer;" onclick="this.querySelector(\'.saved-body\').style.display=this.querySelector(\'.saved-body\').style.display===\'none\'?\'block\':\'none\'">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><strong>' + escapeHtml(c.title) + '</strong> <span style="background:var(--accent-blue-soft);color:var(--accent-blue);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">' + (typeLabels[c.type] || c.type) + '</span></div>' +
            '<span style="color:var(--text-muted);font-size:0.85rem;">' + new Date(c.createdAt).toLocaleDateString() + '</span>' +
            '</div>' +
            '<div class="saved-body" style="display:none;margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;white-space:pre-wrap;font-size:0.9rem;max-height:400px;overflow-y:auto;">' + safeContent + '</div>' +
            '</div>';
        }).join('');
      } catch (err) {
        container.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error loading saved content: ' + escapeHtml(err.message) + '</p>';
      }
    }
    globalThis.loadSavedCampaigns = loadSavedCampaigns;

    async function runResearch() {
      const category = document.getElementById('research-category').value;
      const focus = document.getElementById('research-focus').value;
      const customQuery = document.getElementById('research-custom').value;
      const resultsDiv = document.getElementById('research-results');
      const btn = document.getElementById('research-btn');
      const sourceCount = document.getElementById('research-source-count');
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px;"></span> Searching the web...';
      resultsDiv.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>AI is searching the internet for real opportunities…<br><small style="color:var(--text-muted);">This may take 30-60 seconds</small></span></div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/research`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ category, focus, customQuery: customQuery || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Research failed');
        const opps = data.opportunities || [];
        if (sourceCount) sourceCount.textContent = (data.sources?.length || 0) + ' web sources found';
        if (opps.length === 0) {
          resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No opportunities found. Try a different category or focus area.</p>';
          return;
        }
        renderResearchResults(opps, data.sources || []);
      } catch (err) {
        resultsDiv.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="search"></span> Search & Find Opportunities';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    globalThis.runResearch = runResearch;

    function renderResearchResults(opportunities, sources) {
      const container = document.getElementById('research-results');
      if (!container) return;
      const categoryColors = { grants: 'var(--accent-green)', investors: 'var(--accent-blue)', accelerators: 'var(--accent-gold)', partnerships: 'var(--accent-purple, #8b5cf6)', media: 'var(--accent-teal, #14b8a6)', competitions: 'var(--accent-red, #ef4444)' };
      let html = '';
      opportunities.forEach((opp, idx) => {
        const color = categoryColors[opp.type] || 'var(--accent-blue)';
        const statusBadge = opp.status === 'sent' ? '<span style="background:var(--accent-green-soft);color:var(--accent-green);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">Sent</span>' : '<span style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">Draft</span>';
        html += '<div style="border:1px solid var(--border-subtle);border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid ' + color + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">';
        html += '<div><strong style="font-size:1.05rem;">' + escapeHtml(opp.name) + '</strong>' + statusBadge + '</div>';
        html += '<div style="display:flex;align-items:center;gap:4px;"><span class="icon-inline" data-icon="star"></span><span style="font-weight:600;">' + (opp.relevanceScore || '?') + '/10</span></div>';
        html += '</div>';
        html += '<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:8px;">' + escapeHtml(opp.description || '') + '</p>';
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">';
        if (opp.value) html += '<span><strong>Value:</strong> ' + escapeHtml(opp.value) + '</span>';
        if (opp.deadline) html += '<span><strong>Deadline:</strong> ' + escapeHtml(opp.deadline) + '</span>';
        if (opp.contactMethod) html += '<span><strong>Contact:</strong> ' + escapeHtml(opp.contactMethod) + '</span>';
        html += '</div>';
        html += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-weight:500;color:var(--accent-blue);user-select:none;">View/Edit Outreach Email</summary>';
        html += '<div style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;">';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Subject:</label><input type="text" class="form-input outreach-subject" data-id="' + opp.id + '" value="' + escapeHtml(opp.emailSubject || '') + '" style="width:100%;margin-top:4px;"></div>';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Email Body:</label><textarea class="form-input outreach-body" data-id="' + opp.id + '" style="width:100%;min-height:120px;margin-top:4px;">' + escapeHtml(opp.emailBody || '') + '</textarea></div>';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Send To:</label><input type="email" class="form-input outreach-to" data-id="' + opp.id + '" placeholder="recipient@example.com" style="width:100%;margin-top:4px;"></div>';
        html += '<div style="display:flex;gap:8px;margin-top:8px;">';
        html += '<button class="btn btn-sm btn-primary" onclick="sendOutreach(' + opp.id + ', event)" style="background:var(--accent-green);"><span class="icon-inline" data-icon="send"></span> Send Email</button>';
        html += '<button class="btn btn-sm" onclick="updateOutreach(' + opp.id + ')"><span class="icon-inline" data-icon="check"></span> Save Edits</button>';
        html += '<button class="btn btn-sm" onclick="copyOutreachEmail(' + opp.id + ')"><span class="icon-inline" data-icon="clipboard"></span> Copy</button>';
        html += '</div></div></details></div>';
      });
      if (sources.length > 0) {
        html += '<div style="margin-top:16px;padding:12px;background:var(--bg-elevated);border-radius:8px;"><strong style="font-size:0.9rem;">Web Sources Used:</strong><ul style="margin:8px 0 0 16px;font-size:0.85rem;color:var(--text-muted);">';
        sources.forEach(s => {
          html += '<li style="margin-bottom:4px;"><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener" style="color:var(--accent-blue);">' + escapeHtml(s.title || s.url) + '</a></li>';
        });
        html += '</ul></div>';
      }
      container.innerHTML = html;
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
    }

    async function sendOutreach(id, evt) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      const toEl = document.querySelector('.outreach-to[data-id="' + id + '"]');
      if (!toEl || !toEl.value.trim()) { showToast('Enter a recipient email address', 'error'); return; }
      if (!subjectEl?.value || !bodyEl?.value) { showToast('Subject and body are required', 'error'); return; }
      const btn = evt ? evt.target.closest('button') : null;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-send`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ id, to: toEl.value.trim(), subject: subjectEl.value, body: bodyEl.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast('Outreach email sent successfully!');
        if (btn) { btn.innerHTML = '<span class="icon-inline" data-icon="check"></span> Sent!'; btn.style.background = 'var(--accent-green)'; }
      } catch (err) {
        showToast('Failed to send: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Email'; }
      }
    }
    globalThis.sendOutreach = sendOutreach;

    async function updateOutreach(id) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-update`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ id, emailSubject: subjectEl?.value, emailBody: bodyEl?.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Edits saved');
      } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
      }
    }
    globalThis.updateOutreach = updateOutreach;

    function copyOutreachEmail(id) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      const text = 'Subject: ' + (subjectEl?.value || '') + '\n\n' + (bodyEl?.value || '');
      navigator.clipboard.writeText(text).then(() => showToast('Email copied'));
    }
    globalThis.copyOutreachEmail = copyOutreachEmail;

    async function loadOutreachQueue() {
      const resultsDiv = document.getElementById('research-results');
      if (!resultsDiv) return;
      resultsDiv.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading outreach queue...</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-queue`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const items = data.items || [];
        if (items.length === 0) {
          resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No items in outreach queue. Run a research search first.</p>';
          return;
        }
        renderResearchResults(items, []);
      } catch (err) {
        resultsDiv.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    globalThis.loadOutreachQueue = loadOutreachQueue;

    let emailOutreachLeads = [];

    function toggleEmailOutreachSection() {
      const filtersDiv = document.getElementById('email-outreach-filters');
      const icon = document.getElementById('outreach-toggle-icon');
      if (!filtersDiv) return;
      const isHidden = filtersDiv.style.display === 'none';
      filtersDiv.style.display = isHidden ? 'flex' : 'none';
      if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    globalThis.toggleEmailOutreachSection = toggleEmailOutreachSection;

    async function loadEmailOutreachLeads() {
      const preview = document.getElementById('email-outreach-leads-preview');
      if (!preview) return;
      preview.style.display = 'block';
      preview.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">Loading leads...</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const type = document.getElementById('email-lead-type')?.value || '';
        const minScore = document.getElementById('email-lead-score')?.value || '';
        const source = document.getElementById('email-lead-source')?.value || '';
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (minScore) params.set('min_score', minScore);
        if (source) params.set('source', source);
        params.set('limit', '200');
        const data = await aiOpsFetch(`${apiBase}/api/admin/marketing/outreach-leads?${params}`, { headers: getMarketingHeaders() });
        emailOutreachLeads = (data.leads || []).filter(l => l.email);
        if (emailOutreachLeads.length === 0) {
          preview.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">No leads with email addresses found for these filters.</div>';
          const addBtn = document.getElementById('email-add-leads-btn');
          if (addBtn) addBtn.style.display = 'none';
          return;
        }
        preview.innerHTML = `<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:500;">${emailOutreachLeads.length} leads with emails</span><label style="cursor:pointer;font-size:0.85rem;"><input type="checkbox" id="email-lead-select-all" onchange="toggleAllEmailLeads(this.checked)" checked> Select all</label></div>` +
          emailOutreachLeads.map((l, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;border-bottom:1px solid var(--border-subtle);"><input type="checkbox" class="email-lead-cb" data-idx="${i}" checked onchange="updateEmailLeadCount()"> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>${escapeHtml(l.name || 'Unknown')}</strong> (${l.type})</span><span style="color:var(--text-muted);">${escapeHtml(l.email)}</span></div>`).join('');
        const addBtn = document.getElementById('email-add-leads-btn');
        if (addBtn) addBtn.style.display = 'block';
        showToast(`Loaded ${emailOutreachLeads.length} leads from Outreach Engine`);
      } catch (err) {
        renderAiOpsAuthError(preview, err, loadEmailOutreachLeads);
        const addBtn = document.getElementById('email-add-leads-btn');
        if (addBtn) addBtn.style.display = 'none';
      }
    }
    globalThis.loadEmailOutreachLeads = loadEmailOutreachLeads;

    function toggleAllEmailLeads(checked) {
      document.querySelectorAll('.email-lead-cb').forEach(cb => cb.checked = checked);
    }
    globalThis.toggleAllEmailLeads = toggleAllEmailLeads;

    function updateEmailLeadCount() {
      const checked = document.querySelectorAll('.email-lead-cb:checked').length;
      const selectAll = document.getElementById('email-lead-select-all');
      if (selectAll) selectAll.checked = checked === emailOutreachLeads.length;
    }
    globalThis.updateEmailLeadCount = updateEmailLeadCount;

    function addSelectedLeadsToRecipients() {
      const selected = [];
      document.querySelectorAll('.email-lead-cb:checked').forEach(cb => {
        const idx = Number.parseInt(cb.dataset.idx);
        if (emailOutreachLeads[idx]?.email) selected.push(emailOutreachLeads[idx].email);
      });
      if (selected.length === 0) { showToast('No leads selected', 'error'); return; }
      const textarea = document.getElementById('email-recipients');
      if (!textarea) return;
      const existing = textarea.value.split(',').map(e => e.trim()).filter(Boolean);
      const merged = [...new Set([...existing, ...selected])];
      textarea.value = merged.join(', ');
      showToast(`Added ${selected.length} leads (${merged.length} total recipients)`);
      checkEmailDedup();
    }
    globalThis.addSelectedLeadsToRecipients = addSelectedLeadsToRecipients;

    async function checkEmailDedup() {
      const status = document.getElementById('email-dedup-status');
      if (!status) return;
      const textarea = document.getElementById('email-recipients');
      if (!textarea) return;
      const emails = textarea.value.split(',').map(e => e.trim()).filter(e => e.includes('@'));
      if (emails.length === 0) { status.textContent = ''; return; }
      status.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Checking duplicates...</span>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/check-dedup`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ emails })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const dupCount = (data.duplicates || []).length;
        if (dupCount > 0) {
          status.innerHTML = `<span style="color:var(--accent-gold);font-size:0.8rem;">${dupCount} recipient(s) recently contacted via Outreach Engine</span>`;
        } else {
          status.innerHTML = '<span style="color:var(--accent-green);font-size:0.8rem;">No recent duplicates found</span>';
        }
      } catch (err) {
        status.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Dedup check unavailable</span>';
      }
    }
    globalThis.checkEmailDedup = checkEmailDedup;

    async function sendCampaignToLeads() {
      if (!currentEmailHtml) { showToast('Generate an email first', 'error'); return; }
      const selectedIds = [];
      document.querySelectorAll('.email-lead-cb:checked').forEach(cb => {
        const idx = Number.parseInt(cb.dataset.idx);
        if (emailOutreachLeads[idx]?.id) selectedIds.push(emailOutreachLeads[idx].id);
      });
      if (selectedIds.length === 0) { showToast('No leads selected', 'error'); return; }
      if (!confirm(`Send this email campaign to ${selectedIds.length} outreach leads? This will also log the send in the Outreach Engine.`)) return;
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/campaign-to-leads`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ subject: currentEmailSubject || 'MCC Campaign', html: currentEmailHtml, lead_ids: selectedIds, fromName: 'My Car Concierge' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast(`Campaign sent: ${data.sent} delivered, ${data.skipped} skipped, ${data.failed} failed`);
      } catch (err) {
        showToast('Send failed: ' + err.message, 'error');
      }
    }
    globalThis.sendCampaignToLeads = sendCampaignToLeads;

    async function loadGrowthFunnel() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const data = await aiOpsFetch(`${apiBase}/api/admin/marketing/pipeline-metrics`, { headers: getMarketingHeaders() });

        const el = (id) => document.getElementById(id);
        if (el('funnel-total-leads')) el('funnel-total-leads').textContent = (data.total_leads || 0).toLocaleString();
        if (el('funnel-messages-sent')) el('funnel-messages-sent').textContent = (data.total_messages_sent || 0).toLocaleString();
        if (el('funnel-response-rate')) el('funnel-response-rate').textContent = (data.response_rate || 0).toFixed(1) + '%';

        const funnel = data.conversion_funnel || {};
        const convRate = funnel.discovered > 0 ? ((funnel.converted || 0) / funnel.discovered * 100).toFixed(1) : '0.0';
        if (el('funnel-conversion-rate')) el('funnel-conversion-rate').textContent = convRate + '%';

        const byType = data.leads_by_type || {};
        const typeContainer = el('funnel-leads-by-type');
        if (typeContainer) {
          const typeColors = { provider: 'var(--accent-blue)', member: 'var(--accent-green)', investor: 'var(--accent-gold)' };
          const total = Object.values(byType).reduce((s, v) => s + v, 0) || 1;
          typeContainer.innerHTML = Object.entries(byType).map(([type, count]) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);"><div style="display:flex;align-items:center;gap:8px;"><span style="width:10px;height:10px;border-radius:50%;background:${typeColors[type] || 'var(--text-muted)'};"></span><span style="text-transform:capitalize;">${type}</span></div><div style="display:flex;align-items:center;gap:12px;"><div style="width:120px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${typeColors[type] || 'var(--text-muted)'};width:${(count/total*100).toFixed(0)}%;border-radius:3px;"></div></div><strong>${count.toLocaleString()}</strong></div></div>`
          ).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px;">No leads yet</p>';
        }

        const bySource = data.leads_by_source || {};
        const sourceContainer = el('funnel-leads-by-source');
        if (sourceContainer) {
          const srcTotal = Object.values(bySource).reduce((s, v) => s + v, 0) || 1;
          const sourceLabels = { google_places: 'Google Places', community_discovery: 'Community Discovery', crm_reengagement: 'CRM Re-engagement', referral_nudge: 'Referral Nudge', stalled_application: 'Stalled Applications', manual: 'Manual Entry', csv_import: 'CSV Import', member_places: 'Member Places' };
          sourceContainer.innerHTML = Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([src, count]) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;"><span style="font-size:0.9rem;">${sourceLabels[src] || src.replaceAll('_', ' ')}</span><div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;height:5px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--accent-blue);width:${(count/srcTotal*100).toFixed(0)}%;border-radius:3px;"></div></div><span style="font-weight:500;min-width:30px;text-align:right;">${count}</span></div></div>`
          ).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px;">No data</p>';
        }

        const stagesContainer = el('funnel-stages');
        if (stagesContainer) {
          const stages = [
            { key: 'discovered', label: 'Discovered', color: '#6366f1' },
            { key: 'scored', label: 'Scored', color: '#8b5cf6' },
            { key: 'drafted', label: 'Drafted', color: '#a855f7' },
            { key: 'sent', label: 'Sent', color: '#d946ef' },
            { key: 'responded', label: 'Responded', color: '#ec4899' },
            { key: 'converted', label: 'Converted', color: '#22c55e' }
          ];
          const maxVal = Math.max(...stages.map(s => funnel[s.key] || 0), 1);
          stagesContainer.innerHTML = stages.map(s => {
            const val = funnel[s.key] || 0;
            const pct = (val / maxVal * 100).toFixed(0);
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;"><span style="min-width:80px;font-size:0.85rem;text-align:right;">${s.label}</span><div style="flex:1;height:24px;background:var(--bg-tertiary);border-radius:6px;overflow:hidden;position:relative;"><div style="height:100%;background:${s.color};width:${pct}%;border-radius:6px;transition:width 0.5s ease;"></div><span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.8rem;font-weight:600;">${val.toLocaleString()}</span></div></div>`;
          }).join('');
        }

        const regionsContainer = el('funnel-top-regions');
        if (regionsContainer) {
          const regions = data.top_regions || [];
          regionsContainer.innerHTML = regions.length > 0 ? regions.slice(0, 15).map((r, i) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;${i < regions.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : ''}"><span style="font-size:0.9rem;">${escapeHtml(r.region || r.city || 'Unknown')}</span><strong>${(r.count || 0).toLocaleString()}</strong></div>`
          ).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px;">No regional data yet</p>';
        }

      } catch (err) {
        console.error('Growth funnel load error:', err);
      }
    }
    globalThis.loadGrowthFunnel = loadGrowthFunnel;

    function switchOutreachTab(tab) {
      const panels = document.querySelectorAll('.outreach-panel');
      panels.forEach(p => { p.style.display = 'none'; });
      const buttons = document.querySelectorAll('.outreach-tab');
      buttons.forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.outreach-tab[data-tab="${tab}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      const panelMap = {
        pipeline: 'outreach-pipeline', queue: 'outreach-queue', leads: 'outreach-leads',
        campaigns: 'outreach-campaigns', import: 'outreach-import', analytics: 'outreach-analytics', instantly: 'outreach-instantly'
      };
      const panelId = panelMap[tab];
      if (panelId) {
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
      }
      if (tab === 'queue') loadApprovalQueue();
      else if (tab === 'leads') loadOutreachLeads();
      else if (tab === 'campaigns') loadOutreachCampaigns();
      else if (tab === 'pipeline') loadOutreachPipeline();
      else if (tab === 'analytics') { if (globalThis.loadGrowthFunnel) loadGrowthFunnel(); if (globalThis.loadOutreachAnalytics) loadOutreachAnalytics(); }
      else if (tab === 'instantly') loadInstantlyCampaigns();
    }
    globalThis.switchOutreachTab = switchOutreachTab;

    // Render one queued message card. Extracted from loadApprovalQueue so
    // the loader stays under the cognitive-complexity budget (Task #262).
    function _renderQueueMessageCard(m) {
      const lead = m.outreach_leads || {};
      const ch = m.channel === 'email' ? '✉️' : '💬';
      const contact = m.channel === 'email' ? (lead.email || '') : (lead.phone || '');
      const body = m.body || '';
      const bodyPreview = escapeHtml(body.substring(0, 400)) + (body.length > 400 ? '…' : '');
      const subjectLine = m.subject
        ? `<div style="font-size:0.85rem;font-weight:500;margin-bottom:6px;">Subject: ${escapeHtml(m.subject)}</div>`
        : '';
      return `<div id="queue-msg-${m.id}" style="padding:16px;border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;margin-bottom:2px;">${ch} ${escapeHtml(lead.name || 'Unknown')} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;">${escapeHtml(lead.company || lead.type || '')}</span></div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(contact)}</div>
            ${subjectLine}
            <div style="font-size:0.9rem;color:var(--text-secondary);white-space:pre-wrap;max-height:120px;overflow:hidden;line-height:1.5;">${bodyPreview}</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button class="btn btn-sm btn-primary" onclick="approveMessage('${m.id}')"><span class="icon-inline" data-icon="check"></span> Approve</button>
            <button class="btn btn-sm" onclick="skipMessage('${m.id}')" style="border-color:var(--text-muted);color:var(--text-muted);"><span class="icon-inline" data-icon="x"></span> Skip</button>
          </div>
        </div>
      </div>`;
    }

    async function loadApprovalQueue() {
      const listEl = document.getElementById('outreach-queue-list');
      const bulkBar = document.getElementById('outreach-bulk-bar');
      if (!listEl) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      listEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading approval queue...</div>';
      try {
        const data = await aiOpsFetch(`${apiBase}/api/admin/marketing/outreach-queue?status=draft&limit=50`, { headers: getMarketingHeaders() });
        const messages = data.data || data.items || [];
        if (bulkBar) bulkBar.style.display = messages.length > 0 ? 'block' : 'none';
        if (messages.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No messages pending approval. Run a cycle to generate new drafts.</p>';
          return;
        }
        listEl.innerHTML = messages.map(_renderQueueMessageCard).join('');
        if (globalThis.renderIcons) renderIcons(listEl);
      } catch (err) {
        renderAiOpsAuthError(listEl, err, loadApprovalQueue);
      }
    }
    globalThis.loadApprovalQueue = loadApprovalQueue;

    async function approveMessage(messageId) {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/approve`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve');
        const el = document.getElementById(`queue-msg-${messageId}`);
        if (el) { el.style.opacity = '0.4'; el.style.pointerEvents = 'none'; el.querySelector('.btn.btn-primary').textContent = '✓ Approved'; }
        if (globalThis.showToast) showToast('Message approved and queued for sending', 'success');
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.approveMessage = approveMessage;

    async function skipMessage(messageId) {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/skip`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to skip');
        const el = document.getElementById(`queue-msg-${messageId}`);
        if (el) el.remove();
        if (globalThis.showToast) showToast('Message skipped', 'success');
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.skipMessage = skipMessage;

    async function runCycleNow() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const btn = document.querySelector('[onclick="runCycleNow()"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-cycle`, {
          method: 'POST',
          headers: getMarketingHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Cycle failed');
        if (globalThis.showToast) showToast(`Cycle complete — ${data.drafted || 0} drafted, ${data.sent || 0} sent`, 'success');
        setTimeout(loadApprovalQueue, 1000);
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Run Cycle Now'; if (globalThis.renderIcons) renderIcons(btn); }
      }
    }
    globalThis.runCycleNow = runCycleNow;

    async function flushApprovedQueue() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const btn = document.getElementById('flush-queue-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/flush-queue`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_size: 50 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Flush failed');
        if (globalThis.showToast) showToast(`Sent ${data.sent} — ${data.skipped} skipped (${data.errors} errors)`, data.sent > 0 ? 'success' : 'info');
        setTimeout(loadApprovalQueue, 1500);
      } catch (err) {
        if (globalThis.showToast) showToast('Flush error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Approved'; if (globalThis.renderIcons) renderIcons(btn); }
      }
    }
    globalThis.flushApprovedQueue = flushApprovedQueue;

    async function clearAndRedraft() {
      if (!confirm('This will delete all draft/approved messages and run a fresh cycle. Continue?')) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/clear-and-redraft`, {
          method: 'POST',
          headers: getMarketingHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (globalThis.showToast) showToast(`Cleared ${data.cleared || 0} messages and ran fresh cycle`, 'success');
        setTimeout(loadApprovalQueue, 1000);
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.clearAndRedraft = clearAndRedraft;

    async function bulkApproveAll() {
      if (!confirm('Approve all draft messages for sending?')) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const listRes = await fetch(`${apiBase}/api/admin/marketing/outreach-queue?status=draft&limit=200`, { headers: getMarketingHeaders() });
        const listData = await listRes.json();
        if (!listRes.ok) throw new Error(listData.error || 'Failed to load messages');
        const messageIds = (listData.data || listData.items || []).map(m => m.id);
        if (messageIds.length === 0) { if (globalThis.showToast) showToast('No draft messages to approve', 'error'); return; }
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/approve-bulk`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_ids: messageIds })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve');
        if (globalThis.showToast) showToast(`Approved ${data.approved || 0} messages`, 'success');
        setTimeout(loadApprovalQueue, 800);
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.bulkApproveAll = bulkApproveAll;

    async function syncLeadsToInstantly() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const campaignId = (document.getElementById('instantly-sync-campaign') || {}).value?.trim() || '';
      const syncLimit = Number.parseInt((document.getElementById('instantly-sync-limit') || {}).value || '500', 10);
      const resultEl = document.getElementById('instantly-sync-result');
      const btn = document.getElementById('instantly-sync-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
      try {
        const payload = { limit: syncLimit, min_score: 0 };
        if (campaignId) payload.campaign_id = campaignId;
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-sync`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sync failed');
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.color = 'var(--accent-green)';
          resultEl.innerHTML = `<strong>Sync complete!</strong><br>Leads synced: ${data.synced || 0}<br>${data.message || ''}`;
        }
        if (globalThis.showToast) showToast(`Synced ${data.synced || 0} leads to Instantly.ai`, 'success');
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Sync Leads Now'; if (globalThis.renderIcons) renderIcons(btn); }
      }
    }
    globalThis.syncLeadsToInstantly = syncLeadsToInstantly;

    async function createInstantlyCampaign() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const name = (document.getElementById('instantly-campaign-name') || {}).value?.trim() || '';
      const resultEl = document.getElementById('instantly-campaign-result');
      if (!name) { if (globalThis.showToast) showToast('Campaign name is required', 'error'); return; }
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-create-campaign`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject: 'Grow your auto service business with My Car Concierge', body: 'Hi {{first_name}},\n\nI wanted to reach out about My Car Concierge — a platform connecting local auto service providers with car owners in your area.\n\nWould you be open to a quick chat?\n\nBest,\nThe My Car Concierge Team' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.color = 'var(--accent-green)';
          resultEl.innerHTML = `<strong>Campaign created!</strong><br>ID: ${data.id || data.campaign_id || 'N/A'}<br>Name: ${escapeHtml(data.name || name)}`;
        }
        if (globalThis.showToast) showToast('Instantly campaign created successfully', 'success');
        setTimeout(loadInstantlyCampaigns, 1000);
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.createInstantlyCampaign = createInstantlyCampaign;

    // Pick the rate-cell color based on the rate value. Pure data — keeps
    // the row template under the cognitive-complexity budget (Task #262).
    function _instantlyRateColor(rate, hotThreshold) {
      if (rate > hotThreshold) return 'var(--accent-green)';
      if (rate > 0) return 'var(--text-primary)';
      return 'var(--text-muted)';
    }

    function _renderInstantlyCampaignRow(c) {
      const sent = c.emails_sent_count || 0;
      const openRate = typeof c.open_rate === 'number' ? c.open_rate.toFixed(1) + '%' : '—';
      const replyRate = typeof c.reply_rate === 'number' ? c.reply_rate.toFixed(1) + '%' : '—';
      const statusBg = c.status === 'active' ? 'var(--accent-green)' : 'var(--bg-tertiary)';
      const statusFg = c.status === 'active' ? '#fff' : 'var(--text-muted)';
      const openColor  = _instantlyRateColor(c.open_rate || 0, 20);
      const replyColor = _instantlyRateColor(c.reply_rate || 0, 5);
      return `<tr style="border-bottom:1px solid var(--border-subtle);">
        <td style="padding:10px 12px;font-weight:500;">${escapeHtml(c.name || 'Unnamed')}</td>
        <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.8rem;background:${statusBg};color:${statusFg};">${escapeHtml(c.status || 'draft')}</span></td>
        <td style="padding:10px 12px;text-align:right;">${sent.toLocaleString()}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:${c.open_rate > 0 ? '600' : '400'};color:${openColor};">${openRate}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:${c.reply_rate > 0 ? '600' : '400'};color:${replyColor};">${replyRate}</td>
      </tr>`;
    }

    async function loadInstantlyCampaigns() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('instantly-campaigns-list');
      if (!listEl) return;
      listEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div> Loading campaigns…</div>';
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const campaigns = data.items || data.campaigns || data.data || [];
        if (campaigns.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">No campaigns found in Instantly.ai.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Emails Sent</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Open Rate</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Reply Rate</th>
          </tr></thead>
          <tbody>${campaigns.map(_renderInstantlyCampaignRow).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    globalThis.loadInstantlyCampaigns = loadInstantlyCampaigns;

    async function loadOutreachPipeline() {
      const listEl = document.getElementById('outreach-pipeline-list');
      if (!listEl) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const priority = document.getElementById('pipeline-filter-priority')?.value || '';
      const stage = document.getElementById('pipeline-filter-stage')?.value || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading pipeline…</div>';
      try {
        const params = new URLSearchParams();
        if (priority) params.set('priority', priority);
        if (stage) params.set('stage', stage);
        const res = await fetch(`${apiBase}/api/admin/outreach/pipeline?${params}`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const rows = Array.isArray(data) ? data : (data.data || []);
        if (rows.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No leads in pipeline yet. Score some leads to populate this view.</p>';
          return;
        }
        const priorityColors = { high: 'var(--accent-green)', medium: 'var(--accent-gold)', low: 'var(--text-muted)' };
        const stageLabels = { new: 'New', draft_ready: 'Draft Ready', message_queued: 'Queued', contacted: 'Contacted', converted: 'Converted' };
        listEl.innerHTML = rows.map(r => {
          const lead = r.outreach_leads || {};
          const score = (r.opportunity_score || 0).toFixed(0);
          const pColor = priorityColors[r.priority] || 'var(--text-muted)';
          return `<div style="display:grid;grid-template-columns:60px 1fr 60px 1fr auto 100px 90px auto;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border-subtle);font-size:0.875rem;">
            <span style="padding:2px 8px;border-radius:20px;background:${pColor};color:#fff;font-size:0.75rem;text-align:center;font-weight:600;">${(r.priority || 'low').toUpperCase()}</span>
            <div><div style="font-weight:500;">${escapeHtml(lead.name || '—')}</div><div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(lead.company || lead.type || '')}</div></div>
            <span style="font-weight:700;text-align:center;">${score}</span>
            <span style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((r.ai_notes || '').substring(0, 60))}${(r.ai_notes || '').length > 60 ? '…' : ''}</span>
            <span style="font-size:0.8rem;">${r.preferred_channel || 'email'}</span>
            <span style="padding:2px 8px;border-radius:20px;background:var(--bg-tertiary);font-size:0.75rem;">${stageLabels[r.stage] || r.stage || ''}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${r.added_at ? new Date(r.added_at).toLocaleDateString() : '—'}</span>
            <button class="btn btn-sm" onclick="globalThis.outreachFetch && outreachFetch('/messages/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lead_id:'${lead.id}'})}).then(()=>{showToast('Draft created');loadApprovalQueue();switchOutreachTab('queue');})">Draft</button>
          </div>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    globalThis.loadOutreachPipeline = loadOutreachPipeline;

    async function loadOutreachLeads() {
      const listEl = document.getElementById('outreach-leads-list');
      if (!listEl) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const search = document.getElementById('leads-search')?.value?.trim() || '';
      const type = document.getElementById('leads-filter-type')?.value || '';
      const status = document.getElementById('leads-filter-status')?.value || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading leads…</div>';
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (search) params.set('search', search);
        if (type) params.set('type', type);
        if (status) params.set('status', status);
        const res = await fetch(`${apiBase}/api/admin/outreach/leads?${params}`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const leads = data.data || [];
        if (leads.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No leads found.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Type</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Email</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Location</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Score</th>
          </tr></thead>
          <tbody>${leads.map(l => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;font-weight:500;">${escapeHtml(l.name || '—')}<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(l.company || '')}</div></td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(l.type || '—')}</td>
            <td style="padding:10px 12px;font-size:0.85rem;">${escapeHtml(l.email || '—')}</td>
            <td style="padding:10px 12px;font-size:0.85rem;">${escapeHtml(l.location || '—')}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.75rem;background:var(--bg-tertiary);">${escapeHtml(l.status || 'new')}</span></td>
            <td style="padding:10px 12px;text-align:right;font-weight:600;">${l.score != null ? l.score.toFixed(0) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    globalThis.loadOutreachLeads = loadOutreachLeads;

    async function loadOutreachCampaigns() {
      const listEl = document.getElementById('outreach-campaigns-list');
      if (!listEl) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading campaigns…</div>';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const campaigns = Array.isArray(data) ? data : (data.data || []);
        if (campaigns.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No campaigns yet. Create one to get started.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Target</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Channel</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Auto-Send</th>
          </tr></thead>
          <tbody>${campaigns.map(c => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;font-weight:500;">${escapeHtml(c.name || '—')}</td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(c.target_type || '—')}</td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(c.channel || '—')}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.75rem;background:${c.status === 'active' ? 'var(--accent-green)' : 'var(--bg-tertiary)'};color:${c.status === 'active' ? '#fff' : 'var(--text-primary)'};">${escapeHtml(c.status || 'draft')}</span></td>
            <td style="padding:10px 12px;">${c.auto_send_followups ? '<span style="color:var(--accent-green);">Yes</span>' : '<span style="color:var(--text-muted);">No</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    globalThis.loadOutreachCampaigns = loadOutreachCampaigns;

    function outreachFetch(pathname, opts) {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      return fetch(`${apiBase}/api/admin/outreach${pathname}`, {
        ...opts,
        headers: { ...getMarketingHeaders(), ...(opts?.headers ? opts.headers : {}) }
      }).then(r => r.json());
    }
    globalThis.outreachFetch = outreachFetch;

