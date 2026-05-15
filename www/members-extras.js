// ========== MY CAR CONCIERGE - EXTRAS MODULE ==========
// Emergency, fuel, insurance, messaging, fleet, household, spending, shop, referrals, etc.

    // ========== MESSAGING ==========
    async function openMessageWithProvider(packageId, providerId) {
      currentViewPackage = packageId;
      currentMessageProvider = providerId;

      // Get provider alias (not real name for privacy)
      const { data: providerProfile } = await supabaseClient
        .from('profiles')
        .select('provider_alias')
        .eq('id', providerId)
        .single();

      // Use alias or generate anonymous ID
      const providerName = providerProfile?.provider_alias || `Provider #${providerId.slice(0,4).toUpperCase()}`;

      const { data: messages } = await supabaseClient.from('messages').select('*').eq('package_id', packageId).or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`).order('created_at', { ascending: true });

      const thread = document.getElementById('message-thread');
      if (!messages?.length) {
        thread.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No messages yet. Start the conversation!</p>';
      } else {
        thread.innerHTML = messages.map(m => `
          <div class="message ${m.sender_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-bubble">${m.content}</div>
            <div class="message-time">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('');
        thread.scrollTop = thread.scrollHeight;
      }

      document.getElementById('message-modal-title').textContent = `Message ${providerName}`;
      document.getElementById('message-input').value = '';
      document.getElementById('message-modal').classList.add('active');
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const content = input.value.trim();
      if (!content || !currentMessageProvider || !currentViewPackage) return;

      const { error } = await supabaseClient.from('messages').insert({
        package_id: currentViewPackage,
        sender_id: currentUser.id,
        recipient_id: currentMessageProvider,
        content
      });

      if (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
        return;
      }

      input.value = '';
      await openMessageWithProvider(currentViewPackage, currentMessageProvider);
    }


    // ========== CIRCUMVENTION REPORTING ==========
    let reportEvidenceFiles = [];

    function openReportModal() {
      // Reset form
      document.getElementById('report-type').value = '';
      document.getElementById('report-description').value = '';
      document.getElementById('report-truthful').checked = false;
      reportEvidenceFiles = [];
      document.getElementById('report-evidence-list').innerHTML = '';
      
      closeModal('message-modal');
      document.getElementById('report-modal').classList.add('active');
    }

    function handleReportEvidence(input) {
      const files = Array.from(input.files);
      files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
          showToast(`${file.name} is too large (max 10MB)`, 'error');
          return;
        }
        reportEvidenceFiles.push(file);
      });
      renderReportEvidence();
      input.value = '';
    }

    function renderReportEvidence() {
      const container = document.getElementById('report-evidence-list');
      container.innerHTML = reportEvidenceFiles.map((file, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:4px;">
          <span style="font-size:0.85rem;">${mccIcon('paperclip', 16)} ${file.name}</span>
          <button onclick="removeReportEvidence(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">×</button>
        </div>
      `).join('');
    }

    function removeReportEvidence(index) {
      reportEvidenceFiles.splice(index, 1);
      renderReportEvidence();
    }

    async function submitReport() {
      const reportType = document.getElementById('report-type').value;
      const description = document.getElementById('report-description').value.trim();
      const truthful = document.getElementById('report-truthful').checked;

      if (!reportType) return showToast('Please select a violation type', 'error');
      if (!description) return showToast('Please describe what happened', 'error');
      if (!truthful) return showToast('Please confirm this report is truthful', 'error');

      showToast('Submitting report...', 'success');

      try {
        // Upload evidence files if any
        let evidenceUrls = [];
        for (const file of reportEvidenceFiles) {
          const fileName = `${currentUser.id}/${Date.now()}-${file.name}`;
          const { data, error } = await supabaseClient.storage
            .from('report-evidence')
            .upload(fileName, file);
          
          if (!error && data) {
            const { data: urlData } = supabaseClient.storage
              .from('report-evidence')
              .getPublicUrl(fileName);
            evidenceUrls.push(urlData.publicUrl);
          }
        }

        // Create report record
        const { error } = await supabaseClient.from('circumvention_reports').insert({
          reporter_id: currentUser.id,
          provider_id: currentMessageProvider,
          package_id: currentViewPackage,
          report_type: reportType,
          description: description,
          evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
          status: 'pending'
        });

        if (error) {
          console.error('Report submission error:', error);
          // If table doesn't exist, still show success (report noted)
          if (error.code === '42P01') {
            closeModal('report-modal');
            showToast('Report received. Our team will investigate. Thank you for helping keep MCC safe!', 'success');
            return;
          }
          throw error;
        }

        closeModal('report-modal');
        showToast('Report submitted successfully. Our team will investigate and you may be eligible for a reward if the violation is confirmed. Thank you!', 'success');
      } catch (err) {
        console.error('Report error:', err);
        showToast('Report noted. Our team will review. Thank you!', 'success');
        closeModal('report-modal');
      }
    }

    // ========== NOTIFICATIONS ==========
    // notifications array is declared in members-core.js (shared global scope)

    async function loadNotifications() {
      try {
        const { data, error } = await supabaseClient
          .from('notifications')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.log('Notifications table may not exist:', error);
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
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    function renderNotifications() {
      const container = document.getElementById('notifications-list');
      
      if (!notifications.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${mccIcon('bell', 40)}</div><p>No notifications yet.</p></div>`;
        return;
      }

      const notifIcons = {
        'bid_received': mccIcon('dollar-sign', 16),
        'bid_accepted': mccIcon('check-circle', 16),
        'work_started': mccIcon('wrench', 16),
        'work_completed': mccIcon('check', 16),
        'message_received': mccIcon('message-square', 16),
        'payment_released': mccIcon('credit-card', 16),
        'upsell_request': mccIcon('alert-triangle', 16),
        'reminder': mccIcon('bell', 16),
        'default': mccIcon('bell', 16)
      };

      container.innerHTML = notifications.map(n => {
        const icon = notifIcons[n.type] || notifIcons['default'];
        const timeAgo = formatTimeAgo(n.created_at);
        const unreadClass = n.read ? '' : 'unread';
        
        return `
          <div class="notification-item ${unreadClass}" onclick="handleNotificationClick('${n.id}', '${n.link_type || ''}', '${n.link_id || ''}')" style="display:flex;gap:16px;padding:16px 20px;background:${n.read ? 'var(--bg-card)' : 'var(--accent-gold-soft)'};border:1px solid ${n.read ? 'var(--border-subtle)' : 'rgba(212,168,85,0.3)'};border-radius:var(--radius-md);margin-bottom:12px;cursor:pointer;transition:all 0.15s;">
            <div style="font-size:24px;">${icon}</div>
            <div style="flex:1;">
              <div style="font-weight:${n.read ? '400' : '600'};margin-bottom:4px;">${n.title}</div>
              ${n.message ? `<div style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">${n.message}</div>` : ''}
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">${timeAgo}</div>
            </div>
            ${!n.read ? '<div style="width:10px;height:10px;background:var(--accent-gold);border-radius:50%;flex-shrink:0;margin-top:6px;"></div>' : ''}
          </div>
        `;
      }).join('');
    }

    function formatTimeAgo(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    }

    async function handleNotificationClick(notifId, linkType, linkId) {
      // Mark as read
      await supabaseClient
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);

      // Navigate based on link type
      if (linkType === 'package' && linkId) {
        showSection('packages');
        setTimeout(() => viewPackage(linkId), 100);
      } else if (linkType === 'message' && linkId) {
        showSection('messages');
      } else if (linkType === 'upsell') {
        showSection('upsells');
      }

      // Refresh notifications
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

      showToast('All notifications marked as read', 'success');
      await loadNotifications();
    }

    // Create notification helper (called when actions happen)
    async function createNotification(type, title, message, linkType = null, linkId = null) {
      try {
        await supabaseClient.from('notifications').insert({
          user_id: currentUser.id,
          type,
          title,
          message,
          link_type: linkType,
          link_id: linkId
        });
      } catch (err) {
        console.log('Could not create notification:', err);
      }
    }


    // ==================== SERVICE COORDINATION FUNCTIONS ====================

    // Store current logistics context
    let currentLogisticsContext = {
      packageId: null,
      memberId: null,
      providerId: null,
      appointmentId: null,
      transferId: null
    };

    // Load logistics data for a package
    let driverLocationRefreshInterval = null;
    
    async function loadLogisticsData(packageId) {
      try {
        const [appointmentResult, transferResult, locationResult, driverLocationResult] = await Promise.all([
          getAppointment(packageId),
          getVehicleTransfer(packageId),
          getActiveLocationShare(packageId),
          window.getDriverLocation(packageId)
        ]);

        renderAppointmentStatus(packageId, appointmentResult.data);
        renderTransferStatus(packageId, transferResult.data);
        renderLocationStatus(packageId, locationResult.data, driverLocationResult.data);
        loadEvidenceTimeline(packageId);
        loadKeyExchangeTimeline(packageId);
        loadInspectionReport(packageId);
        loadSlotBookingStatus(packageId);
        
        if (driverLocationRefreshInterval) {
          clearInterval(driverLocationRefreshInterval);
        }
        driverLocationRefreshInterval = setInterval(async () => {
          const { data: driverLoc } = await window.getDriverLocation(packageId);
          const { data: providerLoc } = await getActiveLocationShare(packageId);
          renderLocationStatus(packageId, providerLoc, driverLoc);
        }, 18000);
      } catch (err) {
        console.error('Error loading logistics data:', err);
      }
    }

    // Render appointment status
    function renderAppointmentStatus(packageId, appointment) {
      const container = document.getElementById(`appointment-status-${packageId}`);
      if (!container) return;

      if (!appointment) {
        container.innerHTML = `
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">${mccIcon('calendar', 24)}</span>
              No appointment scheduled yet. Propose a time to get started.
            </div>
          </div>
        `;
        return;
      }

      const statusColors = {
        'proposed': { bg: 'var(--accent-gold-soft)', color: 'var(--accent-gold)', icon: mccIcon('clock', 16) },
        'counter_proposed': { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', icon: mccIcon('refresh-cw', 16) },
        'confirmed': { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', icon: mccIcon('check', 16) },
        'cancelled': { bg: 'rgba(239, 95, 95, 0.15)', color: 'var(--accent-red)', icon: mccIcon('x', 16) }
      };
      const status = statusColors[appointment.status] || statusColors['proposed'];
      const date = new Date(appointment.proposed_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const timeStart = appointment.proposed_time_start || 'TBD';
      const timeEnd = appointment.proposed_time_end || 'TBD';
      const proposedByMe = appointment.proposed_by === currentUser?.id;

      container.innerHTML = `
        <div style="padding:16px;background:${status.bg};border-radius:var(--radius-md);border:1px solid ${status.color}30;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:${status.color};margin-bottom:4px;">
                ${status.icon} ${appointment.status.replace('_', ' ').toUpperCase()}
              </div>
              <div style="font-size:1.1rem;font-weight:600;color:var(--text-primary);">${date}</div>
              <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${mccIcon('clock', 16)} ${timeStart} - ${timeEnd}</div>
            </div>
            ${appointment.estimated_days ? `<div style="text-align:right;"><div style="font-size:0.8rem;color:var(--text-muted);">Est. Duration</div><div style="font-weight:600;color:var(--text-primary);">${appointment.estimated_days} day(s)</div></div>` : ''}
          </div>
          ${appointment.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:12px;">"${appointment.notes}"</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${appointment.status === 'proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="confirmScheduleFromMember('${appointment.id}', '${packageId}')">${mccIcon('check', 16)} Confirm Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">${mccIcon('refresh-cw', 16)} Propose Different Time</button>
            ` : ''}
            ${appointment.status === 'counter_proposed' && proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">${mccIcon('check', 16)} Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">${mccIcon('refresh-cw', 16)} Counter Again</button>
            ` : ''}
            ${appointment.status === 'proposed' && proposedByMe ? `
              <div style="font-size:0.85rem;color:var(--text-muted);">${mccIcon('clock', 16)} Waiting for provider response...</div>
            ` : ''}
            ${appointment.status === 'counter_proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">${mccIcon('check', 16)} Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">${mccIcon('refresh-cw', 16)} Counter Again</button>
            ` : ''}
            ${appointment.status === 'confirmed' ? `
              <div style="font-size:0.85rem;color:var(--accent-green);">${mccIcon('check', 16)} Appointment confirmed! See you on ${date}.</div>
            ` : ''}
          </div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px dashed ${status.color}40;">
            <button class="btn btn-secondary btn-sm" onclick="window.openConciergeRequestModal('${packageId}','${appointment.id}')">
              ${mccIcon('car', 14)} Request a Driver
            </button>
            <div id="concierge-status-${packageId}" style="margin-top:8px;"></div>
          </div>
        </div>
      `;
      // Refresh any existing concierge job status badge for this appointment.
      if (typeof window.loadConciergeStatusForAppointment === 'function') {
        window.loadConciergeStatusForAppointment(packageId, appointment.id);
      }
    }

    // ---- Task #369: Concierge driver request flow (member-initiated) ----
    async function getConciergeAuthHeader() {
      // Use Supabase's own session — its persisted localStorage key is
      // project-specific (sb-<ref>-auth-token) so we cannot read it directly
      // by name. supabaseClient.auth.getSession() returns the active session
      // regardless of storage key.
      try {
        const { data: { session } = {} } = await supabaseClient.auth.getSession();
        const token = session && session.access_token;
        return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : null;
      } catch { return null; }
    }

    // Shared status renderer used by member appointment status, member
    // vehicle-detail page, and provider Vehicle Transfers panel. Renders
    // current leg + assigned driver name/photo + an ETA placeholder so the
    // experience is consistent across surfaces. Returns HTML string.
    window.renderConciergeStatusCard = function(j, opts = {}) {
      const escHtml = (s) => String(s == null ? '' : s)
        .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
        .replaceAll('"','&quot;').replaceAll("'",'&#39;');
      if (!j) return '';
      const statusLabel = escHtml((j.status || 'requested').replaceAll('_',' ').toUpperCase());
      const tier      = Number.isInteger(j.tier)     ? j.tier     : '?';
      const scenario  = Number.isInteger(j.scenario) ? j.scenario : '?';
      const accepted  = (j.assignments || []).filter(a => a.accepted_at);
      // Drivers (joined name + photo) — server enriches assignments[].driver
      const driversHtml = accepted.map(a => {
        const d = a.driver || {};
        const initials = (d.name || '?').split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();
        const avatar = d.avatar_url
          ? `<img src="${escHtml(d.avatar_url)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />`
          : `<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-gold);color:#000;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;">${escHtml(initials)}</div>`;
        return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:8px;">${avatar}<span style="font-size:0.85rem;">${escHtml(d.name || 'Driver')}</span></span>`;
      }).join('');
      const leg = j.current_leg || (Array.isArray(j.legs) && j.legs[0]) || null;
      const legHtml = leg ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">
        <strong>Leg ${escHtml(leg.sequence)}:</strong> ${escHtml(leg.from_address || '—')} → ${escHtml(leg.to_address || '—')}
      </div>` : '';
      // ETA placeholder — real ETA arrives once the Driver app posts
      // location pings. Until then we surface scheduled_start_at if known.
      const eta = j.scheduled_start_at
        ? new Date(j.scheduled_start_at).toLocaleString()
        : 'Awaiting driver dispatch';
      const cancelBtn = (j.status === 'requested' || j.status === 'scheduled')
        ? `<button class="btn btn-ghost btn-sm" style="margin-left:8px;" onclick="window.cancelConciergeJob('${escHtml(j.id)}','${escHtml(opts.packageId || '')}','${escHtml(j.appointment_id || '')}')">Cancel</button>`
        : '';
      return `
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
            <div><strong>${mccIcon('car', 14)} Driver request</strong> · <span style="text-transform:uppercase;font-size:0.8rem;color:var(--accent-gold);">${statusLabel}</span></div>
            <div style="font-size:0.78rem;color:var(--text-muted);">Tier ${tier} · Scenario ${scenario}</div>
          </div>
          ${legHtml}
          <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">${mccIcon('clock', 12)} ETA: ${escHtml(eta)}</div>
          ${accepted.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;">${driversHtml}</div>`
            : `<div style="margin-top:6px;font-size:0.82rem;color:var(--text-muted);">No driver assigned yet</div>`}
          <div style="margin-top:6px;">${cancelBtn}</div>
        </div>
      `;
    };

    // Task #369: render status for vehicle-originated concierge jobs (no
    // appointment_id). Looks up the most recent live job for the member
    // and renders the shared status card into the vehicle-detail panel.
    window.loadConciergeStatusForVehicle = async function(vehicleId) {
      const container = document.getElementById('concierge-status-vehicle-' + vehicleId);
      if (!container) return;
      const headers = await getConciergeAuthHeader();
      if (!headers) return;
      try {
        const resp = await fetch('/api/concierge?role=member', { headers });
        if (!resp.ok) return;
        const { jobs = [] } = await resp.json();
        const mine = jobs.filter(j =>
          j.member_vehicle_id === vehicleId && j.status !== 'cancelled' && j.status !== 'completed'
        );
        if (!mine.length) { container.innerHTML = ''; return; }
        const det = await fetch('/api/concierge/' + mine[0].id, { headers });
        const job = det.ok ? (await det.json()).job : mine[0];
        container.innerHTML = window.renderConciergeStatusCard(job, { packageId: 'vehicle-' + vehicleId });
      } catch (e) { console.warn('[concierge] vehicle status load failed', e); }
    };

    window.loadConciergeStatusForAppointment = async function(packageId, appointmentId) {
      const container = document.getElementById('concierge-status-' + packageId);
      if (!container) return;
      const headers = await getConciergeAuthHeader();
      if (!headers) return;
      try {
        const resp = await fetch('/api/concierge?role=member', { headers });
        if (!resp.ok) return;
        const { jobs = [] } = await resp.json();
        const mine = jobs.filter(j => j.appointment_id === appointmentId && j.status !== 'cancelled');
        if (!mine.length) { container.innerHTML = ''; return; }
        // Fetch the enriched single-job payload so we get driver name/photo.
        const det = await fetch('/api/concierge/' + mine[0].id, { headers });
        const job = det.ok ? (await det.json()).job : mine[0];
        container.innerHTML = window.renderConciergeStatusCard(job, { packageId });
      } catch (e) { console.warn('[concierge] status load failed', e); }
    };

    window.cancelConciergeJob = async function(jobId, packageId, appointmentId) {
      const reason = window.prompt('Why are you cancelling this driver request?', 'Plans changed');
      if (!reason || reason.trim().length < 3) return;
      const headers = await getConciergeAuthHeader();
      if (!headers) { alert('Please sign in again to cancel.'); return; }
      const resp = await fetch('/api/concierge/' + jobId + '/cancel', {
        method: 'POST', headers, body: JSON.stringify({ reason: reason.trim() })
      });
      if (!resp.ok) { alert('Cancel failed: ' + (await resp.text())); return; }
      window.loadConciergeStatusForAppointment(packageId, appointmentId);
    };

    // Best-effort defaults: pull saved member address (for pickup) and the
    // appointment / provider shop address (for dropoff) so the member doesn't
    // have to retype them.
    async function loadConciergeDefaults(appointmentId) {
      const out = { pickup: '', dropoff: '' };
      try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth) {
          const { data: ses } = await supabaseClient.auth.getUser();
          const uid = ses?.user?.id;
          if (uid) {
            const { data: prof } = await supabaseClient.from('profiles')
              .select('address, city, state, zip').eq('id', uid).maybeSingle();
            if (prof?.address) {
              out.pickup = [prof.address, prof.city, prof.state, prof.zip].filter(Boolean).join(', ');
            }
          }
          if (appointmentId) {
            const { data: appt } = await supabaseClient.from('appointments')
              .select('provider_id').eq('id', appointmentId).maybeSingle();
            if (appt?.provider_id) {
              const { data: prov } = await supabaseClient.from('profiles')
                .select('business_name, address, city, state, zip')
                .eq('id', appt.provider_id).maybeSingle();
              if (prov?.address) {
                out.dropoff = [prov.business_name, prov.address, prov.city, prov.state, prov.zip].filter(Boolean).join(', ');
              }
            }
          }
        }
      } catch (e) { /* best-effort */ }
      return out;
    }

    window.openConciergeRequestModal = function(packageId, appointmentId) {
      const existing = document.getElementById('concierge-request-modal');
      if (existing) existing.remove();
      const tiers = [
        { tier: 1, label: 'Tier 1 — Passenger ride', scenarios: [
          { v: 1, label: 'Drop me off at the shop' },
          { v: 2, label: 'Pick me up from the shop' },
          { v: 3, label: 'Round trip (drop off + pick up)' }
        ]},
        { tier: 2, label: 'Tier 2 — Drive my vehicle (solo shuttle)', scenarios: [
          { v: 4, label: 'Drive my car TO the shop' },
          { v: 5, label: 'Drive my car FROM the shop' },
          { v: 6, label: 'Round-trip vehicle shuttle' }
        ]},
        { tier: 3, label: 'Tier 3 — Paired shuttle (driver + chase car)', scenarios: [
          { v: 7, label: 'Take my car in (chase follow)' },
          { v: 8, label: 'Bring my car back (chase follow)' }
        ]},
        { tier: 4, label: 'Tier 4 — Full concierge (driver A + driver B)', scenarios: [
          { v: 9,  label: 'Drop-off concierge (drive my car + drive me)' },
          { v: 10, label: 'Pick-up concierge (drive my car + drive me)' },
          { v: 11, label: 'Round-trip concierge' }
        ]}
      ];
      const optionsHtml = tiers.map(t => `
        <optgroup label="${t.label}">
          ${t.scenarios.map(s => `<option value="${t.tier}|${s.v}">${s.label}</option>`).join('')}
        </optgroup>
      `).join('');
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop active';
      modal.id = 'concierge-request-modal';
      modal.innerHTML = `
        <div class="modal" style="max-width:520px;">
          <div class="modal-header">
            <h3 class="modal-title">${mccIcon('car', 18)} Request a Driver</h3>
            <button class="modal-close" onclick="document.getElementById('concierge-request-modal').remove()">×</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
            <p style="font-size:0.9rem;color:var(--text-secondary);margin:0;">Pick a service tier and we'll dispatch one or two MCC drivers to handle the trip.</p>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:0.85rem;color:var(--text-muted);">Service</span>
              <select id="concierge-scenario" class="input">${optionsHtml}</select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:0.85rem;color:var(--text-muted);">Pickup address (your home / origin)</span>
              <input id="concierge-pickup" class="input" type="text" placeholder="123 Home St" />
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:0.85rem;color:var(--text-muted);">Dropoff address (the shop)</span>
              <input id="concierge-dropoff" class="input" type="text" placeholder="Shop address" />
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:0.85rem;color:var(--text-muted);">Preferred pickup time (optional)</span>
              <input id="concierge-time" class="input" type="datetime-local" />
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:0.85rem;color:var(--text-muted);">Notes for the driver (optional)</span>
              <textarea id="concierge-notes" class="input" rows="3" placeholder="Gate code, key location, special instructions…"></textarea>
            </label>
            <div id="concierge-request-error" style="color:var(--accent-red);font-size:0.85rem;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button class="btn btn-ghost" onclick="document.getElementById('concierge-request-modal').remove()">Cancel</button>
              <button id="concierge-submit-btn" class="btn btn-primary" onclick="window.submitConciergeRequest('${packageId}','${appointmentId}')">${mccIcon('send', 14)} Submit Request</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // Best-effort auto-fill once the modal is mounted.
      loadConciergeDefaults(appointmentId).then(d => {
        const p = document.getElementById('concierge-pickup');
        const dr = document.getElementById('concierge-dropoff');
        if (p && !p.value && d.pickup) p.value = d.pickup;
        if (dr && !dr.value && d.dropoff) dr.value = d.dropoff;
      });
    };

    window.submitConciergeRequest = async function(packageId, appointmentId) {
      const errEl = document.getElementById('concierge-request-error');
      const btn   = document.getElementById('concierge-submit-btn');
      errEl.textContent = '';
      const sel  = document.getElementById('concierge-scenario').value.split('|');
      const tier = Number(sel[0]); const scenario = Number(sel[1]);
      const pickup  = document.getElementById('concierge-pickup').value.trim();
      const dropoff = document.getElementById('concierge-dropoff').value.trim();
      const time    = document.getElementById('concierge-time').value;
      const notes   = document.getElementById('concierge-notes').value.trim();
      if (!pickup || !dropoff) { errEl.textContent = 'Pickup and dropoff are required.'; return; }
      const headers = await getConciergeAuthHeader();
      if (!headers) { errEl.textContent = 'Please sign in again.'; return; }
      btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        const resp = await fetch('/api/concierge', {
          method: 'POST', headers,
          body: JSON.stringify({
            tier, scenario,
            appointment_id: appointmentId || null,
            pickup_address: pickup,
            dropoff_address: dropoff,
            scheduled_start_at: time ? new Date(time).toISOString() : null,
            notes: notes || null,
            // Vehicle-context flow (packageId starts with 'vehicle-') passes
            // the vehicle id so the status loader can find the job back.
            member_vehicle_id: (typeof packageId === 'string' && packageId.indexOf('vehicle-') === 0)
              ? packageId.slice('vehicle-'.length) : null
          })
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) { errEl.textContent = body.error || ('Request failed (' + resp.status + ')'); return; }
        // Success state: replace modal body with confirmation + status link.
        const jobId = body.job?.id || '';
        const modal = document.getElementById('concierge-request-modal');
        if (modal) {
          modal.querySelector('.modal-body').innerHTML = `
            <div style="text-align:center;padding:12px;">
              <div style="font-size:2rem;color:var(--accent-green);">${mccIcon('check', 32)}</div>
              <h4 style="margin:8px 0;">Driver request submitted!</h4>
              <p style="font-size:0.9rem;color:var(--text-secondary);">Reference: <code>${jobId.slice(0, 8)}…</code></p>
              <p style="font-size:0.85rem;color:var(--text-muted);">We'll notify you as soon as a driver accepts. You can track status on this appointment card.</p>
              <div style="margin-top:12px;">
                <button class="btn btn-primary" onclick="document.getElementById('concierge-request-modal').remove()">Done</button>
              </div>
            </div>
          `;
        }
        // Vehicle-context flow: refresh the vehicle status panel; otherwise
        // refresh the appointment status panel.
        if (typeof packageId === 'string' && packageId.indexOf('vehicle-') === 0) {
          if (typeof window.loadConciergeStatusForVehicle === 'function') {
            window.loadConciergeStatusForVehicle(packageId.slice('vehicle-'.length));
          }
        } else {
          window.loadConciergeStatusForAppointment(packageId, appointmentId);
        }
      } catch (e) {
        errEl.textContent = 'Network error: ' + e.message;
      } finally {
        btn.disabled = false; btn.textContent = '✈ Submit Request';
      }
    };

    async function loadSlotBookingStatus(packageId) {
      const container = document.getElementById(`slot-booking-status-${packageId}`);
      if (!container) return;

      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('sb-token');
        if (!token) return;

        const resp = await fetch(`/api/booking/package/${packageId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) {
          container.style.display = 'none';
          return;
        }

        const result = await resp.json();
        const b = result.booking;

        if (!b || b.status !== 'booked') {
          container.style.display = 'none';
          return;
        }

        container.style.display = 'block';
        const date = new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const startFormatted = formatSlotTime(b.start_time);
        const endFormatted = formatSlotTime(b.end_time);
        container.innerHTML = `
          <div style="padding:14px;background:var(--accent-green-soft, rgba(74,222,128,0.1));border-radius:var(--radius-md);border:1px solid var(--accent-green, #4ade80)30;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent-green, #4ade80);margin-bottom:4px;">
                  ${mccIcon('check', 14)} SLOT BOOKED
                </div>
                <div style="font-weight:600;color:var(--text-primary);">${date}</div>
                <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:2px;">${mccIcon('clock', 14)} ${startFormatted} - ${endFormatted} (${b.duration_minutes} min)</div>
              </div>
              <button class="btn btn-sm" style="background:rgba(239,95,95,0.15);color:var(--accent-red);border:1px solid var(--accent-red)30;" onclick="cancelSlotBooking('${b.id}', '${packageId}')">
                ${mccIcon('x', 14)} Cancel
              </button>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Error loading slot booking status:', err);
        container.style.display = 'none';
      }
    }

    function formatSlotTime(timeStr) {
      if (!timeStr) return 'TBD';
      const [h, m] = timeStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    window.cancelSlotBooking = async function(bookingId, packageId) {
      if (!confirm('Cancel this booked time slot?')) return;
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('sb-token');
        const resp = await fetch('/api/booking/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ booking_id: bookingId, cancel_reason: 'Cancelled by member' })
        });
        if (resp.ok) {
          showToast('Booking cancelled', 'success');
          loadSlotBookingStatus(packageId);
        } else {
          const err = await resp.json();
          showToast(err.error || 'Failed to cancel booking', 'error');
        }
      } catch (err) {
        showToast('Error cancelling booking', 'error');
      }
    };

    // Render transfer status with timeline
    function renderTransferStatus(packageId, transfer) {
      const container = document.getElementById(`transfer-status-${packageId}`);
      if (!container) return;

      if (!transfer) {
        container.innerHTML = `
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">${mccIcon('car', 24)}</span>
              No transfer method set. Configure how your vehicle will be delivered.
            </div>
          </div>
        `;
        return;
      }

      const transferTypes = {
        'member_dropoff': { label: 'Member Drop-off', icon: mccIcon('car', 16), desc: 'You bring the vehicle to the provider' },
        'provider_pickup': { label: 'Provider Pickup', icon: mccIcon('truck', 16), desc: 'Provider picks up from your location' },
        'mobile_service': { label: 'Mobile Service', icon: mccIcon('wrench', 16), desc: 'Service performed at your location' },
        'towing': { label: 'Towing Required', icon: mccIcon('truck', 16), desc: 'Vehicle will be towed' }
      };
      const type = transferTypes[transfer.transfer_type] || transferTypes['member_dropoff'];

      const statusSteps = [
        { key: 'pending', label: 'Pending', icon: mccIcon('clock', 16) },
        { key: 'scheduled', label: 'Scheduled', icon: mccIcon('calendar', 16) },
        { key: 'in_transit_to_provider', label: 'In Transit', icon: mccIcon('car', 16) },
        { key: 'with_provider', label: 'With Provider', icon: mccIcon('wrench', 16) },
        { key: 'work_complete', label: 'Work Complete', icon: mccIcon('check-circle', 16) },
        { key: 'in_transit_to_member', label: 'Returning', icon: mccIcon('home', 16) },
        { key: 'returned', label: 'Returned', icon: mccIcon('check', 16) }
      ];

      const currentStepIndex = statusSteps.findIndex(s => s.key === transfer.vehicle_status) || 0;

      container.innerHTML = `
        <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:48px;height:48px;background:var(--accent-blue-soft);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:24px;">${type.icon}</div>
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${type.label}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">${type.desc}</div>
            </div>
          </div>
          
          <!-- Timeline -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;position:relative;padding:0 4px;">
              <div style="position:absolute;top:12px;left:20px;right:20px;height:3px;background:var(--border-subtle);z-index:0;"></div>
              <div style="position:absolute;top:12px;left:20px;height:3px;background:var(--accent-green);z-index:1;width:${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}%;transition:width 0.3s;"></div>
              ${statusSteps.map((step, i) => `
                <div style="display:flex;flex-direction:column;align-items:center;z-index:2;flex:1;">
                  <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;
                    ${i < currentStepIndex ? 'background:var(--accent-green);color:#022c22;' : 
                      i === currentStepIndex ? 'background:var(--accent-blue);color:white;animation:pulse 2s infinite;' : 
                      'background:var(--bg-elevated);border:2px solid var(--border-subtle);color:var(--text-muted);'}">
                    ${i <= currentStepIndex ? step.icon : (i + 1)}
                  </div>
                  <div style="font-size:0.65rem;color:${i <= currentStepIndex ? 'var(--text-primary)' : 'var(--text-muted)'};margin-top:6px;text-align:center;max-width:60px;">${step.label}</div>
                </div>
              `).join('')}
            </div>
          </div>

          ${transfer.pickup_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${mccIcon('map-pin', 16)} Pickup: ${transfer.pickup_address}</div>` : ''}
          ${transfer.return_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${mccIcon('home', 16)} Return: ${transfer.return_address}</div>` : ''}
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${transfer.vehicle_status === 'pending' || transfer.vehicle_status === 'scheduled' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'pickup')">${mccIcon('check', 16)} Confirm Handoff</button>
            ` : ''}
            ${transfer.vehicle_status === 'in_transit_to_member' || transfer.vehicle_status === 'work_complete' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'return')">${mccIcon('check', 16)} Confirm Vehicle Received</button>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Render location status
    function renderLocationStatus(packageId, locationShare, driverLocation) {
      const container = document.getElementById(`location-status-${packageId}`);
      if (!container) return;

      let html = '';
      
      if (driverLocation && driverLocation.lat && driverLocation.lng) {
        const updatedAt = new Date(driverLocation.updated_at).toLocaleTimeString();
        const updatedDate = new Date(driverLocation.updated_at).toLocaleDateString();
        const mapsUrl = `https://www.google.com/maps?q=${driverLocation.lat},${driverLocation.lng}`;
        const driverName = driverLocation.profiles?.business_name || driverLocation.profiles?.provider_alias || driverLocation.profiles?.full_name || 'Driver';
        const trackingTypeLabels = {
          'pickup': mccIcon('car', 16) + ' Picking up your vehicle',
          'return': mccIcon('car', 16) + ' Returning your vehicle',
          'in_transit': mccIcon('car', 16) + ' In transit'
        };
        const trackingLabel = trackingTypeLabels[driverLocation.tracking_type] || mccIcon('car', 16) + ' Driver is on the way';
        
        html += `
          <div style="padding:16px;background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);border-radius:var(--radius-md);margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <div style="width:12px;height:12px;border-radius:50%;background:var(--accent-green);animation:pulse 1.5s ease-in-out infinite;flex-shrink:0;"></div>
              <div>
                <div style="font-weight:600;color:var(--accent-green);font-size:0.95rem;">${trackingLabel}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${driverName} is sharing live location</div>
              </div>
            </div>
            
            <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:6px;">
                    ${mccIcon('map-pin', 16)} Live Location
                  </div>
                  <div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">
                    ${Number.parseFloat(driverLocation.lat).toFixed(6)}, ${Number.parseFloat(driverLocation.lng).toFixed(6)}
                  </div>
                  ${driverLocation.speed ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">Speed: ${driverLocation.speed} mph</div>` : ''}
                  <div style="font-size:0.8rem;color:var(--text-muted);">Last update: ${updatedAt} on ${updatedDate}</div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">
                  ${mccIcon('map-pin', 16)} Open Maps
                </a>
              </div>
            </div>
            
            <div style="text-align:center;">
              <div style="display:inline-block;padding:8px 16px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
                <iframe 
                  src="https://www.openstreetmap.org/export/embed.html?bbox=${Number.parseFloat(driverLocation.lng) - 0.01},${Number.parseFloat(driverLocation.lat) - 0.01},${Number.parseFloat(driverLocation.lng) + 0.01},${Number.parseFloat(driverLocation.lat) + 0.01}&layer=mapnik&marker=${driverLocation.lat},${driverLocation.lng}" 
                  style="width:100%;min-width:280px;height:180px;border:none;border-radius:var(--radius-sm);"
                  loading="lazy"
                ></iframe>
              </div>
            </div>
          </div>
        `;
      }
      
      if (locationShare) {
        const isFromMe = locationShare.shared_by === currentUser?.id;
        const sharedAt = new Date(locationShare.shared_at).toLocaleString();
        const mapsUrl = `https://www.google.com/maps?q=${locationShare.latitude},${locationShare.longitude}`;

        html += `
          <div style="padding:16px;background:${isFromMe ? 'var(--accent-green-soft)' : 'var(--accent-blue-soft)'};border-radius:var(--radius-md);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:${isFromMe ? 'var(--accent-green)' : 'var(--accent-blue)'};margin-bottom:4px;">
                  ${isFromMe ? mccIcon('map-pin', 16) + ' Your Shared Location' : mccIcon('map-pin', 16) + ' Provider Location (One-time)'}
                </div>
                ${locationShare.address ? `<div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">${locationShare.address}</div>` : ''}
                <div style="font-size:0.8rem;color:var(--text-muted);">Shared: ${sharedAt}</div>
                ${locationShare.message ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">"${locationShare.message}"</div>` : ''}
              </div>
              <a href="${mapsUrl}" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration:none;">
                ${mccIcon('map-pin', 16)} Open Maps
              </a>
            </div>
          </div>
        `;
      }
      
      if (!html) {
        html = `
          <div style="color:var(--text-muted);font-size:0.9rem;">
            Share your location to help the provider find you for pickup. When the driver is on the way, you'll see their live location here.
          </div>
        `;
      }
      
      container.innerHTML = html;
    }

    // ========== MEMBER EVIDENCE FUNCTIONS ==========

    const memberEvidenceTypeLabels = {
      'pre_pickup': { label: 'Pre-Pickup Condition', icon: mccIcon('circle-alert', 16), color: 'var(--accent-blue)' },
      'arrival_shop': { label: 'Arrival at Shop', icon: mccIcon('alert-triangle', 16), color: '#f59e0b' },
      'post_service': { label: 'Post-Service Condition', icon: mccIcon('check-circle', 16), color: 'var(--accent-green)' },
      'return': { label: 'Vehicle Return', icon: mccIcon('circle-alert', 16), color: '#a855f7' }
    };

    async function loadEvidenceTimeline(packageId) {
      const container = document.getElementById(`evidence-timeline-${packageId}`);
      if (!container) return;

      try {
        const { data: evidence } = await window.getPackageEvidence(packageId);

        if (!evidence || evidence.length === 0) {
          container.innerHTML = `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
              <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">${mccIcon('camera', 24)}</span>
                No evidence captured yet. Document your vehicle condition before pickup.
              </div>
            </div>
          `;
          return;
        }

        const timeline = evidence.map(e => {
          const typeInfo = memberEvidenceTypeLabels[e.type] || { label: e.type, icon: mccIcon('camera', 16), color: 'var(--text-muted)' };
          const photoGrid = e.photos?.length ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              ${e.photos.slice(0, 4).map(url => `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
              ${e.photos.length > 4 ? `<div style="width:60px;height:60px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:var(--text-muted);">+${e.photos.length - 4}</div>` : ''}
            </div>
          ` : '';

          const createdByName = e.profiles?.business_name || e.profiles?.full_name || (e.created_by_role === 'member' ? 'You' : 'Provider');

          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid ${typeInfo.color};margin-bottom:12px;">
              <div style="font-size:20px;">${typeInfo.icon}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="font-weight:600;font-size:0.9rem;">${typeInfo.label}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">by ${createdByName}</div>
                </div>
                <div style="display:flex;gap:16px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px;">
                  <span>${mccIcon('bar-chart', 16)} ${e.odometer?.toLocaleString() || 'N/A'} mi</span>
                  <span>${mccIcon('fuel', 16)} ${e.fuel_level || 'N/A'}</span>
                </div>
                ${e.exterior_condition ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;"><strong>Exterior:</strong> ${e.exterior_condition}</div>` : ''}
                ${e.interior_condition ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;"><strong>Interior:</strong> ${e.interior_condition}</div>` : ''}
                ${e.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${e.notes}</div>` : ''}
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">${new Date(e.created_at).toLocaleString()}</div>
                ${photoGrid}
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = timeline || '<div style="color:var(--text-muted);font-size:0.9rem;">No evidence captured yet.</div>';
      } catch (err) {
        console.error('Error loading evidence timeline:', err);
        container.innerHTML = '<div style="color:var(--accent-red);font-size:0.9rem;">Failed to load evidence.</div>';
      }
    }

    async function loadKeyExchangeTimeline(packageId) {
      const container = document.getElementById(`key-exchange-timeline-${packageId}`);
      if (!container) return;

      try {
        const { data: keyExchanges, error } = await supabaseClient
          .from('key_exchanges')
          .select('*')
          .eq('package_id', packageId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!keyExchanges || keyExchanges.length === 0) {
          container.innerHTML = `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
              <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">${mccIcon('key', 24)}</span>
                No key exchanges recorded yet. The provider will document key handoffs at pickup and return.
              </div>
            </div>
          `;
          return;
        }

        const stageInfo = {
          'pickup': { label: 'Pickup Key Exchange', icon: mccIcon('circle-alert', 16), color: 'var(--accent-blue)' },
          'return': { label: 'Return Key Exchange', icon: mccIcon('circle-alert', 16), color: '#a855f7' }
        };

        const timeline = keyExchanges.map(exchange => {
          const info = stageInfo[exchange.stage] || { label: exchange.stage, icon: mccIcon('key', 16), color: 'var(--text-muted)' };
          
          const photoGrid = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              ${exchange.driver_id_photo_url ? `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:2px solid var(--accent-gold);position:relative;cursor:pointer;" onclick="window.open('${exchange.driver_id_photo_url}','_blank')">
                  <img src="${exchange.driver_id_photo_url}" style="width:100%;height:100%;object-fit:cover;">
                  <div style="position:absolute;top:2px;right:2px;background:var(--accent-gold);color:#000;padding:1px 3px;border-radius:3px;font-size:0.55rem;font-weight:600;">ID</div>
                </div>
              ` : ''}
              ${(exchange.key_photos || []).slice(0, 3).map(url => `
                <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
            </div>
          `;

          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid ${exchange.verified_at ? 'var(--accent-green)' : info.color};margin-bottom:12px;">
              <div style="font-size:20px;">${info.icon}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:600;font-size:0.9rem;">${info.label}</span>
                    ${exchange.verified_at ? `<span style="background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;">${mccIcon('check', 16)} Verified</span>` : ''}
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">by Provider</div>
                </div>
                ${exchange.verified_at ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${new Date(exchange.verified_at).toLocaleString()}</div>` : ''}
                ${exchange.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${exchange.notes}</div>` : ''}
                ${photoGrid}
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = timeline || '<div style="color:var(--text-muted);font-size:0.9rem;">No key exchanges recorded yet.</div>';
      } catch (err) {
        console.error('Error loading key exchange timeline:', err);
        container.innerHTML = '<div style="color:var(--accent-red);font-size:0.9rem;">Failed to load key exchanges.</div>';
      }
    }

    function openMemberEvidenceModal(packageId, type) {
      document.getElementById('member-evidence-package-id').value = packageId;
      document.getElementById('member-evidence-type').value = type;
      document.getElementById('member-evidence-modal-title').textContent = memberEvidenceTypeLabels[type]?.label || 'Document Vehicle Condition';
      document.getElementById('member-evidence-photo-preview').innerHTML = '';
      document.getElementById('member-evidence-photos').value = '';
      document.getElementById('member-evidence-odometer').value = '';
      document.getElementById('member-evidence-fuel').value = '';
      document.getElementById('member-evidence-exterior').value = '';
      document.getElementById('member-evidence-interior').value = '';
      document.getElementById('member-evidence-notes').value = '';
      document.getElementById('member-evidence-upload-status').style.display = 'none';
      document.getElementById('member-evidence-modal').classList.add('active');
    }

    function previewMemberEvidencePhotos() {
      const fileInput = document.getElementById('member-evidence-photos');
      const preview = document.getElementById('member-evidence-photo-preview');
      const files = Array.from(fileInput.files).slice(0, 10);
      preview.innerHTML = '';
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('div');
          img.style.cssText = 'width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);position:relative;';
          img.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    }

    async function submitMemberEvidence() {
      const packageId = document.getElementById('member-evidence-package-id').value;
      const type = document.getElementById('member-evidence-type').value;
      const fileInput = document.getElementById('member-evidence-photos');
      const odometer = document.getElementById('member-evidence-odometer').value;
      const fuelLevel = document.getElementById('member-evidence-fuel').value;
      const exteriorCondition = document.getElementById('member-evidence-exterior').value;
      const interiorCondition = document.getElementById('member-evidence-interior').value;
      const notes = document.getElementById('member-evidence-notes').value;

      if (!odometer || !fuelLevel) {
        return showToast('Please provide odometer reading and fuel level', 'error');
      }

      const files = Array.from(fileInput.files).slice(0, 10);
      if (files.length === 0) {
        return showToast('Please add at least one photo', 'error');
      }

      const btn = document.getElementById('submit-member-evidence-btn');
      const statusDiv = document.getElementById('member-evidence-upload-status');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">' + mccIcon('send', 16) + ' Uploading photos...</p>';

      try {
        const photoUrls = await window.uploadEvidencePhotos(packageId, files);
        if (photoUrls.length === 0) {
          throw new Error('Failed to upload photos');
        }

        statusDiv.innerHTML = '<p style="color:var(--accent-gold);">' + mccIcon('file-text', 16) + ' Saving evidence...</p>';

        let lat = null, lng = null;
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (e) { }

        const { data, error } = await window.saveEvidence({
          packageId,
          type,
          photos: photoUrls,
          odometer: Number.parseInt(odometer),
          fuelLevel,
          exteriorCondition,
          interiorCondition,
          notes,
          role: 'member',
          lat,
          lng
        });

        if (error) throw error;

        statusDiv.innerHTML = '<p style="color:var(--accent-green);">' + mccIcon('check-circle', 16) + ' Evidence saved successfully!</p>';
        showToast('Vehicle condition documented!', 'success');

        setTimeout(() => {
          closeModal('member-evidence-modal');
          loadEvidenceTimeline(packageId);
        }, 1500);
      } catch (err) {
        console.error('Evidence submission error:', err);
        statusDiv.innerHTML = `<p style="color:var(--accent-red);">${mccIcon('x', 16)} Error: ${err.message || 'Failed to save evidence'}</p>`;
        showToast('Failed to save evidence', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = mccIcon('camera', 16) + ' Save Evidence';
      }
    }

    // ========== SLOT BOOKING STATE ==========
    let _scheduleCtx = { packageId: null, memberId: null, providerId: null };
    let _calendarMonth = new Date().getMonth();
    let _calendarYear = new Date().getFullYear();
    let _providerWorkingHours = [];
    let _selectedDate = null;
    let _selectedSlot = null;

    function _formatTimeTo12Hr(t) {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr = h % 12 || 12;
      return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
    }

    // Open schedule modal
    async function openScheduleModal(packageId, memberId, providerId) {
      currentLogisticsContext = { packageId, memberId, providerId };
      _scheduleCtx = { packageId, memberId, providerId };
      document.getElementById('schedule-package-id').value = packageId;
      document.getElementById('schedule-member-id').value = memberId;
      document.getElementById('schedule-provider-id').value = providerId;

      _selectedDate = null;
      _selectedSlot = null;

      document.getElementById('schedule-slot-view').style.display = 'none';
      document.getElementById('schedule-proposal-view').style.display = 'none';
      document.getElementById('schedule-slot-btn').style.display = 'none';
      document.getElementById('schedule-proposal-btn').style.display = 'none';
      document.getElementById('schedule-loading-view').style.display = 'flex';
      document.getElementById('available-slots-container').style.display = 'none';
      document.getElementById('booking-details-section').style.display = 'none';

      openModal('schedule-modal');

      try {
        const hasAvailability = await checkProviderAvailability(providerId);
        document.getElementById('schedule-loading-view').style.display = 'none';

        if (hasAvailability) {
          document.getElementById('schedule-slot-view').style.display = 'block';
          document.getElementById('schedule-slot-btn').style.display = 'inline-flex';
          _calendarMonth = new Date().getMonth();
          _calendarYear = new Date().getFullYear();
          renderBookingCalendar(providerId);
        } else {
          document.getElementById('schedule-proposal-view').style.display = 'block';
          document.getElementById('schedule-proposal-btn').style.display = 'inline-flex';
          const today = new Date().toISOString().split('T')[0];
          document.getElementById('schedule-date').min = today;
          document.getElementById('schedule-date').value = '';
          document.getElementById('schedule-time-start').value = '09:00';
          document.getElementById('schedule-time-end').value = '17:00';
          document.getElementById('schedule-duration').value = '1';
          document.getElementById('schedule-notes').value = '';
        }
      } catch (err) {
        console.error('Error checking availability:', err);
        document.getElementById('schedule-loading-view').style.display = 'none';
        document.getElementById('schedule-proposal-view').style.display = 'block';
        document.getElementById('schedule-proposal-btn').style.display = 'inline-flex';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('schedule-date').min = today;
        document.getElementById('schedule-date').value = '';
        document.getElementById('schedule-time-start').value = '09:00';
        document.getElementById('schedule-time-end').value = '17:00';
        document.getElementById('schedule-duration').value = '1';
        document.getElementById('schedule-notes').value = '';
      }
    }

    async function checkProviderAvailability(providerId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session.access_token;
        const resp = await fetch(`/api/provider/availability/${providerId}`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        if (data.working_hours && data.working_hours.length > 0) {
          _providerWorkingHours = data.working_hours;
          return true;
        }
        return false;
      } catch (e) {
        console.log('checkProviderAvailability error:', e);
        return false;
      }
    }

    function renderBookingCalendar(providerId) {
      const container = document.getElementById('booking-calendar-container');
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

      const workingDaySet = new Set();
      _providerWorkingHours.forEach(wh => {
        if (wh.is_active !== false) {
          const idx = dayOfWeekNames.indexOf(wh.day_of_week);
          if (idx !== -1) workingDaySet.add(idx);
        }
      });

      const today = new Date();
      today.setHours(0,0,0,0);

      const firstDay = new Date(_calendarYear, _calendarMonth, 1);
      const lastDay = new Date(_calendarYear, _calendarMonth + 1, 0);
      const startDow = firstDay.getDay();
      const daysInMonth = lastDay.getDate();

      let html = `<div class="cal-nav">
        <button onclick="navigateCalendarMonth(-1)" title="Previous month">&#8249;</button>
        <span class="cal-month-label">${monthNames[_calendarMonth]} ${_calendarYear}</span>
        <button onclick="navigateCalendarMonth(1)" title="Next month">&#8250;</button>
      </div>`;
      html += '<div class="mini-calendar">';
      dayNames.forEach(d => { html += `<div class="cal-header">${d}</div>`; });

      for (let i = 0; i < startDow; i++) {
        html += '<div class="calendar-day empty"></div>';
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(_calendarYear, _calendarMonth, d);
        dt.setHours(0,0,0,0);
        const dow = dt.getDay();
        const isPast = dt < today;
        const isToday = dt.getTime() === today.getTime();
        const hasWork = workingDaySet.has(dow);
        const dateStr = `${_calendarYear}-${String(_calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isSelected = _selectedDate === dateStr;

        let classes = 'calendar-day';
        if (isPast) classes += ' disabled';
        if (isToday) classes += ' today';
        if (hasWork && !isPast) classes += ' has-availability';
        if (isSelected) classes += ' selected';
        if (!hasWork && !isPast) classes += ' disabled';

        html += `<div class="${classes}" onclick="selectCalendarDate('${dateStr}')">${d}</div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    }

    function navigateCalendarMonth(direction) {
      _calendarMonth += direction;
      if (_calendarMonth > 11) { _calendarMonth = 0; _calendarYear++; }
      if (_calendarMonth < 0) { _calendarMonth = 11; _calendarYear--; }
      renderBookingCalendar(_scheduleCtx.providerId);
    }

    async function selectCalendarDate(dateStr) {
      _selectedDate = dateStr;
      _selectedSlot = null;
      document.getElementById('booking-details-section').style.display = 'none';
      renderBookingCalendar(_scheduleCtx.providerId);
      await loadDateSlots(dateStr);
    }

    async function loadDateSlots(dateStr) {
      const container = document.getElementById('available-slots-container');
      const slotsList = document.getElementById('slots-list');
      const slotsEmpty = document.getElementById('slots-empty');
      const dateLabel = document.getElementById('slots-date-label');

      container.style.display = 'block';
      const dateParts = dateStr.split('-');
      const dispDate = new Date(Number.parseInt(dateParts[0]), Number.parseInt(dateParts[1])-1, Number.parseInt(dateParts[2]));
      dateLabel.textContent = mccIcon('calendar', 16) + ' ' + dispDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      slotsList.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);"><div class="spinner" style="width:24px;height:24px;border:2px solid var(--border-subtle);border-top-color:var(--accent-gold);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px;"></div>Loading slots...</div>';
      slotsEmpty.style.display = 'none';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session.access_token;
        const resp = await fetch(`/api/provider/available-slots/${_scheduleCtx.providerId}?date=${dateStr}`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!resp.ok) {
          slotsList.innerHTML = '';
          slotsEmpty.style.display = 'block';
          slotsEmpty.textContent = 'Could not load slots. Try again.';
          return;
        }

        const data = await resp.json();
        const slots = data.slots || [];

        if (!slots.length) {
          slotsList.innerHTML = '';
          slotsEmpty.style.display = 'block';
          slotsEmpty.textContent = 'No available slots on this date.';
          return;
        }

        slotsEmpty.style.display = 'none';
        slotsList.innerHTML = slots.map((s, i) => {
          const startFmt = _formatTimeTo12Hr(s.start_time);
          const endFmt = _formatTimeTo12Hr(s.end_time);
          const startMin = _timeToMinutes(s.start_time);
          const endMin = _timeToMinutes(s.end_time);
          const durHrs = ((endMin - startMin) / 60).toFixed(1).replace('.0', '');
          const baysText = s.available_bays != null ? `${s.available_bays} bay${s.available_bays !== 1 ? 's' : ''} open` : '';

          return `<div class="slot-card" id="slot-card-${i}" onclick="selectSlot(${i}, '${s.start_time}', '${s.end_time}', ${s.available_bays || 0})">
            <div>
              <div style="font-weight:600;font-size:1rem;">${mccIcon('clock', 16)} ${startFmt} – ${endFmt}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${durHrs} hr window${baysText ? ' • ' + baysText : ''}</div>
            </div>
            <div style="color:var(--accent-gold);font-size:1.2rem;">›</div>
          </div>`;
        }).join('');
      } catch (err) {
        console.error('loadDateSlots error:', err);
        slotsList.innerHTML = '';
        slotsEmpty.style.display = 'block';
        slotsEmpty.textContent = 'Error loading slots.';
      }
    }

    function _timeToMinutes(t) {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    }

    function selectSlot(index, startTime, endTime, availBays) {
      _selectedSlot = { index, startTime, endTime, availBays };
      document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
      const card = document.getElementById('slot-card-' + index);
      if (card) card.classList.add('selected');
      document.getElementById('booking-details-section').style.display = 'block';
    }

    async function confirmSlotBooking() {
      if (!_selectedDate) {
        showToast('Please select a date', 'error');
        return;
      }
      if (!_selectedSlot) {
        showToast('Please select a time slot', 'error');
        return;
      }

      const duration = document.getElementById('slot-duration').value;
      const location = document.querySelector('input[name="slot-location"]:checked')?.value || 'dropoff';
      const notes = document.getElementById('slot-notes').value.trim();

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session.access_token;

        const resp = await fetch('/api/booking/create', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            package_id: _scheduleCtx.packageId,
            member_id: _scheduleCtx.memberId,
            provider_id: _scheduleCtx.providerId,
            date: _selectedDate,
            start_time: _selectedSlot.startTime,
            end_time: _selectedSlot.endTime,
            duration_minutes: Number.parseInt(duration),
            service_location: location,
            notes: notes
          })
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Booking failed');
        }

        closeModal('schedule-modal');
        showToast('Appointment booked successfully!', 'success');
        loadLogisticsData(_scheduleCtx.packageId);
        if (typeof loadAppointmentStatus === 'function') {
          loadAppointmentStatus(_scheduleCtx.packageId);
        }
      } catch (err) {
        console.error('confirmSlotBooking error:', err);
        showToast('Failed to book slot: ' + err.message, 'error');
      }
    }

    // Submit schedule proposal (fallback when provider has no availability set)
    async function submitScheduleProposal() {
      const packageId = document.getElementById('schedule-package-id').value;
      const memberId = document.getElementById('schedule-member-id').value;
      const providerId = document.getElementById('schedule-provider-id').value;
      const date = document.getElementById('schedule-date').value;
      const timeStart = document.getElementById('schedule-time-start').value;
      const timeEnd = document.getElementById('schedule-time-end').value;
      const duration = Number.parseInt(document.getElementById('schedule-duration').value) || 1;
      const notes = document.getElementById('schedule-notes').value;

      if (!date) {
        showToast('Please select a date', 'error');
        return;
      }

      try {
        const result = await createAppointment(packageId, memberId, providerId, date, timeStart, timeEnd, duration, notes);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Appointment proposed successfully!', 'success');
        closeModal('schedule-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error proposing appointment:', err);
        showToast('Failed to propose appointment: ' + err.message, 'error');
      }
    }

    // Confirm schedule from member
    async function confirmScheduleFromMember(appointmentId, packageId) {
      if (!confirm('Confirm this appointment time?')) return;

      try {
        const result = await confirmAppointment(appointmentId, packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Appointment confirmed!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error confirming appointment:', err);
        showToast('Failed to confirm appointment: ' + err.message, 'error');
      }
    }

    // Accept counter proposal
    async function acceptCounterProposalFromMember(appointmentId, packageId) {
      if (!confirm('Accept the proposed new time?')) return;

      try {
        const result = await acceptCounterProposal(appointmentId, packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Counter proposal accepted!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error accepting counter proposal:', err);
        showToast('Failed to accept counter proposal: ' + err.message, 'error');
      }
    }

    // Open counter proposal modal
    function proposeNewTimeFromMember(appointmentId, packageId) {
      currentLogisticsContext.appointmentId = appointmentId;
      currentLogisticsContext.packageId = packageId;
      
      document.getElementById('counter-appointment-id').value = appointmentId;
      document.getElementById('counter-package-id').value = packageId;
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('counter-date').min = today;
      document.getElementById('counter-date').value = '';
      document.getElementById('counter-time-start').value = '09:00';
      document.getElementById('counter-time-end').value = '17:00';
      document.getElementById('counter-notes').value = '';
      
      openModal('counter-proposal-modal');
    }

    // Submit counter proposal
    async function submitCounterProposal() {
      const appointmentId = document.getElementById('counter-appointment-id').value;
      const packageId = document.getElementById('counter-package-id').value;
      const date = document.getElementById('counter-date').value;
      const timeStart = document.getElementById('counter-time-start').value;
      const timeEnd = document.getElementById('counter-time-end').value;
      const notes = document.getElementById('counter-notes').value;

      if (!date) {
        showToast('Please select a date', 'error');
        return;
      }

      try {
        const result = await proposeNewTime(appointmentId, packageId, date, timeStart, timeEnd, notes);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('New time proposed!', 'success');
        closeModal('counter-proposal-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error proposing new time:', err);
        showToast('Failed to propose new time: ' + err.message, 'error');
      }
    }

    // Open transfer modal
    function openTransferModal(packageId, memberId, providerId) {
      currentLogisticsContext = { packageId, memberId, providerId };
      document.getElementById('transfer-package-id').value = packageId;
      document.getElementById('transfer-member-id').value = memberId;
      document.getElementById('transfer-provider-id').value = providerId;
      
      // Reset form
      document.querySelectorAll('.transfer-type-option').forEach(opt => opt.classList.remove('selected'));
      document.getElementById('transfer-pickup-address').value = '';
      document.getElementById('transfer-pickup-notes').value = '';
      document.getElementById('transfer-return-address').value = '';
      document.getElementById('transfer-special-instructions').value = '';
      document.getElementById('transfer-address-section').style.display = 'none';
      
      openModal('transfer-modal');
    }

    // Select transfer type
    function selectTransferType(type) {
      document.querySelectorAll('.transfer-type-option').forEach(opt => opt.classList.remove('selected'));
      document.querySelector(`[data-transfer-type="${type}"]`).classList.add('selected');
      document.getElementById('selected-transfer-type').value = type;
      
      // Show address fields for pickup or towing
      const addressSection = document.getElementById('transfer-address-section');
      if (type === 'provider_pickup' || type === 'towing') {
        addressSection.style.display = 'block';
      } else {
        addressSection.style.display = 'none';
      }
    }

    // Submit transfer setup
    async function submitTransferSetup() {
      const packageId = document.getElementById('transfer-package-id').value;
      const memberId = document.getElementById('transfer-member-id').value;
      const providerId = document.getElementById('transfer-provider-id').value;
      const transferType = document.getElementById('selected-transfer-type').value;
      const pickupAddress = document.getElementById('transfer-pickup-address').value;
      const pickupNotes = document.getElementById('transfer-pickup-notes').value;
      const returnAddress = document.getElementById('transfer-return-address').value;
      const specialInstructions = document.getElementById('transfer-special-instructions').value;

      if (!transferType) {
        showToast('Please select a transfer method', 'error');
        return;
      }

      if ((transferType === 'provider_pickup' || transferType === 'towing') && !pickupAddress) {
        showToast('Please enter a pickup address', 'error');
        return;
      }

      try {
        const result = await createVehicleTransfer(packageId, memberId, providerId, transferType, pickupAddress, pickupNotes, returnAddress, specialInstructions);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Transfer method set up successfully!', 'success');
        closeModal('transfer-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error setting up transfer:', err);
        showToast('Failed to set up transfer: ' + err.message, 'error');
      }
    }

    // Confirm vehicle handoff
    async function confirmVehicleHandoff(transferId, packageId, type) {
      const confirmMsg = type === 'pickup' 
        ? 'Confirm that you have handed over your vehicle?' 
        : 'Confirm that you have received your vehicle back?';
      
      if (!confirm(confirmMsg)) return;

      try {
        let result;
        if (type === 'pickup') {
          result = await confirmPickup(transferId, packageId, 'member');
        } else {
          result = await confirmReturn(transferId, packageId, 'member');
        }
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast(type === 'pickup' ? 'Handoff confirmed!' : 'Return confirmed!', 'success');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error confirming handoff:', err);
        showToast('Failed to confirm: ' + err.message, 'error');
      }
    }

    // Share my location
    async function shareMyLocation(packageId, providerId) {
      if (!providerId) {
        showToast('No provider assigned yet', 'error');
        return;
      }

      document.getElementById('location-share-package-id').value = packageId;
      document.getElementById('location-share-provider-id').value = providerId;
      document.getElementById('location-share-message').value = '';
      
      openModal('location-share-modal');
    }

    // Confirm and share location
    async function confirmShareLocation() {
      const packageId = document.getElementById('location-share-package-id').value;
      const providerId = document.getElementById('location-share-provider-id').value;
      const message = document.getElementById('location-share-message').value;

      try {
        showToast('Getting your location...', 'success');
        
        const result = await shareLocation(packageId, providerId, 'pickup', message);
        
        if (result.error) {
          throw new Error(result.error);
        }

        showToast('Location shared successfully!', 'success');
        closeModal('location-share-modal');
        loadLogisticsData(packageId);
      } catch (err) {
        console.error('Error sharing location:', err);
        showToast('Failed to share location: ' + err.message, 'error');
      }
    }

    // View shared location from provider
    async function viewSharedLocation(packageId) {
      try {
        const result = await getActiveLocationShare(packageId);
        
        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data) {
          showToast('No location shared by provider yet', 'error');
          return;
        }

        const location = result.data;
        const sharedAt = new Date(location.shared_at).toLocaleString();
        const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

        document.getElementById('view-location-body').innerHTML = `
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:48px;margin-bottom:12px;">${mccIcon('map-pin', 40)}</div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--text-primary);margin-bottom:4px;">
              ${location.shared_by === currentUser?.id ? 'Your Shared Location' : 'Provider Location'}
            </div>
            ${location.address ? `<div style="color:var(--text-secondary);margin-bottom:8px;">${location.address}</div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-muted);">Shared: ${sharedAt}</div>
          </div>
          ${location.message ? `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:20px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Message:</div>
              <div style="color:var(--text-secondary);">"${location.message}"</div>
            </div>
          ` : ''}
          <div style="display:flex;flex-direction:column;gap:8px;">
            <a href="${mapsUrl}" target="_blank" class="btn btn-primary" style="justify-content:center;text-decoration:none;">
              ${mccIcon('map-pin', 16)} Open in Google Maps
            </a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}" target="_blank" class="btn btn-secondary" style="justify-content:center;text-decoration:none;">
              ${mccIcon('car', 16)} Get Directions
            </a>
          </div>
        `;

        // Mark as viewed
        if (location.shared_by !== currentUser?.id) {
          await markLocationViewed(location.id);
        }

        openModal('view-location-modal');
      } catch (err) {
        console.error('Error viewing location:', err);
        showToast('Failed to load location: ' + err.message, 'error');
      }
    }


    // ========== EMERGENCY FUNCTIONS ==========
    async function checkActiveEmergency() {
      try {
        const { data } = await getActiveEmergency(currentUser.id);
        activeEmergency = data;
        updateEmergencyBanner();
      } catch (err) {
        console.error('Error checking emergency:', err);
      }
    }

    function updateEmergencyBanner() {
      const banner = document.getElementById('emergency-alert-banner');
      const statusText = document.getElementById('emergency-banner-status');
      
      if (activeEmergency) {
        banner.style.display = 'flex';
        const statusLabels = {
          'pending': 'Waiting for a provider to accept...',
          'accepted': `Provider assigned! ETA: ${activeEmergency.eta_minutes || '--'} minutes`,
          'en_route': 'Provider is on the way!',
          'arrived': 'Provider has arrived',
          'in_progress': 'Help in progress...'
        };
        statusText.textContent = statusLabels[activeEmergency.status] || activeEmergency.status;
      } else {
        banner.style.display = 'none';
      }
    }

    function openEmergencyRequest() {
      if (activeEmergency) {
        openEmergencyStatus();
        return;
      }
      
      pendingEmergencyPhotos = [];
      document.getElementById('emergency-photo-previews').innerHTML = '';
      document.getElementById('emergency-type').value = '';
      document.getElementById('emergency-description').value = '';
      document.getElementById('emergency-location-text').textContent = 'Getting your location...';
      document.getElementById('emergency-address-text').textContent = '';
      
      const vehicleOptions = '<option value="">No vehicle selected</option>' + vehicles.map(v => 
        `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`
      ).join('');
      document.getElementById('emergency-vehicle').innerHTML = vehicleOptions;
      
      openModal('emergency-request-modal');
      getEmergencyLocation();
    }

    function getEmergencyLocation() {
      if (!navigator.geolocation) {
        document.getElementById('emergency-location-text').textContent = 'Location not available';
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          emergencyLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          document.getElementById('emergency-location-text').innerHTML = mccIcon('map-pin', 16) + ' Location captured';
          
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${emergencyLocation.lat}&lon=${emergencyLocation.lng}`);
            const data = await response.json();
            if (data.display_name) {
              document.getElementById('emergency-address-text').textContent = data.display_name;
              emergencyLocation.address = data.display_name;
            }
          } catch (e) {
            console.log('Could not get address');
          }
        },
        (error) => {
          document.getElementById('emergency-location-text').innerHTML = mccIcon('alert-triangle', 16) + ' Could not get location';
          document.getElementById('emergency-address-text').textContent = 'Please enable location services';
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    function handleEmergencyPhotos(input) {
      const files = Array.from(input.files);
      if (pendingEmergencyPhotos.length + files.length > 5) {
        showToast('Maximum 5 photos allowed', 'error');
        return;
      }
      
      files.forEach(file => {
        pendingEmergencyPhotos.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          const idx = pendingEmergencyPhotos.length - 1;
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          document.getElementById('emergency-photo-previews').appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
      input.value = '';
    }

    function removeEmergencyPhoto(idx) {
      pendingEmergencyPhotos.splice(idx, 1);
      renderEmergencyPhotoPreviews();
    }

    function renderEmergencyPhotoPreviews() {
      const container = document.getElementById('emergency-photo-previews');
      container.innerHTML = '';
      pendingEmergencyPhotos.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          container.appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
    }

    const EMERGENCY_SERVICE_RATES = {
      lockout: { base: 100, perMile: 0, includedMiles: 0, display: mccIcon('lock', 16) + ' Lockout' },
      dead_battery: { base: 100, perMile: 0, includedMiles: 0, display: mccIcon('zap', 16) + ' Jump Start' },
      flat_tire: { base: 125, perMile: 0, includedMiles: 0, display: mccIcon('settings', 16) + ' Flat Tire' },
      fuel_delivery: { base: 125, perMile: 0, includedMiles: 0, display: mccIcon('fuel', 16) + ' Fuel Delivery' },
      tow_needed: { base: 200, perMile: 6, includedMiles: 10, display: mccIcon('truck', 16) + ' Towing' },
      accident: { base: 250, perMile: 6, includedMiles: 10, display: mccIcon('circle-alert', 16) + ' Accident' },
      other: { base: 150, perMile: 0, includedMiles: 0, display: mccIcon('wrench', 16) + ' Other' }
    };
    const EMERGENCY_ACTIVATION_FEE = 25;
    let pendingEmergencyPaymentData = null;

    function calculateEmergencyEscrow(emergencyType, miles = 10) {
      const rate = EMERGENCY_SERVICE_RATES[emergencyType];
      if (!rate) return 0;
      
      let escrow = rate.base;
      if (rate.perMile > 0 && miles > rate.includedMiles) {
        escrow += (miles - rate.includedMiles) * rate.perMile;
      }
      return escrow;
    }

    function handleEmergencyTypeChange() {
      const emergencyType = document.getElementById('emergency-type').value;
      const towDistanceGroup = document.getElementById('tow-distance-group');
      const pricePreview = document.getElementById('emergency-price-preview');
      
      const needsDistance = emergencyType === 'tow_needed' || emergencyType === 'accident';
      towDistanceGroup.style.display = needsDistance ? 'block' : 'none';
      
      if (emergencyType) {
        pricePreview.style.display = 'block';
        updateEmergencyPricePreview();
      } else {
        pricePreview.style.display = 'none';
      }
    }

    function updateEmergencyPricePreview() {
      const emergencyType = document.getElementById('emergency-type').value;
      if (!emergencyType) return;
      
      const miles = Number.parseFloat(document.getElementById('emergency-tow-miles').value) || 10;
      const escrow = calculateEmergencyEscrow(emergencyType, miles);
      const total = EMERGENCY_ACTIVATION_FEE + escrow;
      
      document.getElementById('emergency-escrow-preview').textContent = '$' + escrow.toFixed(2);
      document.getElementById('emergency-total-preview').textContent = '$' + total.toFixed(2);
    }

    function showEmergencyPaymentModal(escrowAmount, totalAmount) {
      document.getElementById('payment-modal-escrow').textContent = '$' + escrowAmount.toFixed(2);
      document.getElementById('payment-modal-escrow-text').textContent = '$' + escrowAmount.toFixed(2);
      document.getElementById('payment-modal-total').textContent = '$' + totalAmount.toFixed(2);
      closeModal('emergency-request-modal');
      openModal('emergency-payment-modal');
    }

    async function submitEmergencyRequest() {
      const emergencyType = document.getElementById('emergency-type').value;
      const description = document.getElementById('emergency-description').value;
      const vehicleId = document.getElementById('emergency-vehicle').value;
      
      if (!emergencyType) {
        showToast('Please select an emergency type', 'error');
        return;
      }
      
      const lat = document.getElementById('emergency-lat').value;
      const lng = document.getElementById('emergency-lng').value;
      
      if (!lat || !lng) {
        showToast('Could not get your location. Please enable location services.', 'error');
        return;
      }
      
      const needsDistance = emergencyType === 'tow_needed' || emergencyType === 'accident';
      const estimatedMiles = needsDistance ? (Number.parseFloat(document.getElementById('emergency-tow-miles').value) || 10) : null;
      const escrowAmount = calculateEmergencyEscrow(emergencyType, estimatedMiles || 10);
      const totalAmount = EMERGENCY_ACTIVATION_FEE + escrowAmount;
      
      pendingEmergencyPaymentData = {
        vehicleId: vehicleId || null,
        lat: Number.parseFloat(lat),
        lng: Number.parseFloat(lng),
        address: document.getElementById('emergency-address').value || null,
        emergencyType: emergencyType,
        description: description,
        estimatedMiles: estimatedMiles,
        activationFee: EMERGENCY_ACTIVATION_FEE,
        escrowAmount: escrowAmount
      };
      
      showEmergencyPaymentModal(escrowAmount, totalAmount);
    }

    async function confirmEmergencyPayment() {
      if (!pendingEmergencyPaymentData) {
        showToast('No pending emergency request', 'error');
        return;
      }
      
      try {
        closeModal('emergency-payment-modal');
        showToast('Processing payment and submitting emergency request...', 'success');
        
        const claimDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        const { data, error } = await createEmergencyRequest({
          vehicleId: pendingEmergencyPaymentData.vehicleId,
          lat: pendingEmergencyPaymentData.lat,
          lng: pendingEmergencyPaymentData.lng,
          address: pendingEmergencyPaymentData.address,
          emergencyType: pendingEmergencyPaymentData.emergencyType,
          description: pendingEmergencyPaymentData.description,
          photos: [],
          activationFee: pendingEmergencyPaymentData.activationFee,
          escrowAmount: pendingEmergencyPaymentData.escrowAmount,
          estimatedMiles: pendingEmergencyPaymentData.estimatedMiles,
          claimDeadline: claimDeadline,
          paymentStatus: 'pending_payment'
        });
        
        if (error) throw new Error(error);
        
        if (pendingEmergencyPhotos.length > 0) {
          const photoUrls = [];
          for (const file of pendingEmergencyPhotos) {
            const { data: url, error: uploadError } = await uploadEmergencyPhoto(data.id, file);
            if (!uploadError && url) photoUrls.push(url);
          }
          
          if (photoUrls.length > 0) {
            await supabaseClient.from('emergency_requests')
              .update({ photos: photoUrls })
              .eq('id', data.id);
          }
        }
        
        pendingEmergencyPaymentData = null;
        activeEmergency = data;
        updateEmergencyBanner();
        showSection('emergency');
        loadEmergencySection();
        showToast(mccIcon('circle-alert', 16) + ' Emergency request submitted! Providers are being notified.', 'success');
        
      } catch (err) {
        console.error('Error submitting emergency:', err);
        showToast('Failed to submit emergency request: ' + err.message, 'error');
      }
    }

    function previewEmergencyPhotos(input) {
      const files = Array.from(input.files);
      pendingEmergencyPhotos = pendingEmergencyPhotos.concat(files);
      const container = document.getElementById('emergency-photo-preview');
      container.innerHTML = '';
      pendingEmergencyPhotos.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.createElement('div');
          preview.className = 'emergency-photo';
          preview.innerHTML = `
            <img src="${e.target.result}" alt="Photo ${idx + 1}">
            <button class="emergency-photo-remove" onclick="removeEmergencyPhoto(${idx})">×</button>
          `;
          container.appendChild(preview);
        };
        reader.readAsDataURL(file);
      });
    }

    async function refreshEmergencyLocation() {
      document.getElementById('emergency-address').value = 'Getting your location...';
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          document.getElementById('emergency-lat').value = pos.coords.latitude;
          document.getElementById('emergency-lng').value = pos.coords.longitude;
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
            const data = await resp.json();
            document.getElementById('emergency-address').value = data.display_name || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          } catch (e) {
            document.getElementById('emergency-address').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          }
        }, (err) => {
          document.getElementById('emergency-address').value = 'Unable to get location';
          showToast('Please enable location services', 'error');
        }, { enableHighAccuracy: true });
      }
    }

    async function loadEmergencySection() {
      if (!currentUser) return;
      
      // Check for active emergency
      const { data: activeData } = await getActiveEmergency(currentUser.id);
      if (activeData) {
        activeEmergency = activeData;
        document.getElementById('emergency-active-status').style.display = 'block';
        document.getElementById('emergency-request-form').style.display = 'none';
        renderEmergencySectionStatus();
        startEmergencyPolling();
      } else {
        stopEmergencyPolling();
        document.getElementById('emergency-active-status').style.display = 'none';
        document.getElementById('emergency-request-form').style.display = 'block';
        refreshEmergencyLocation();
        populateEmergencyVehicles();
      }
      
      // Load history
      const { data: history } = await getMyEmergencies(currentUser.id);
      renderEmergencyHistory(history || []);
    }

    function renderEmergencySectionStatus() {
      const e = activeEmergency;
      if (!e) return;
      
      const typeLabels = {
        'flat_tire': mccIcon('settings', 16) + ' Flat Tire',
        'dead_battery': mccIcon('zap', 16) + ' Dead Battery',
        'lockout': mccIcon('lock', 16) + ' Locked Out',
        'tow_needed': mccIcon('truck', 16) + ' Tow Needed',
        'fuel_delivery': mccIcon('fuel', 16) + ' Out of Fuel',
        'accident': mccIcon('circle-alert', 16) + ' Accident',
        'other': mccIcon('circle-help', 16) + ' Other'
      };
      
      document.getElementById('emergency-active-type').textContent = typeLabels[e.emergency_type] || e.emergency_type;
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: mccIcon('clock', 16), label: 'Waiting for provider' },
        'accepted': { icon: mccIcon('check', 16), label: 'Provider accepted' },
        'en_route': { icon: mccIcon('car', 16), label: 'Provider en route' },
        'arrived': { icon: mccIcon('map-pin', 16), label: 'Provider arrived' },
        'in_progress': { icon: mccIcon('wrench', 16), label: 'Work in progress' },
        'completed': { icon: mccIcon('check-circle', 16), label: 'Completed' }
      };
      
      // Show round info for pending status
      let roundInfoHtml = '';
      if (e.status === 'pending') {
        const currentRound = e.claim_round || 1;
        const claimDeadline = e.claim_deadline ? new Date(e.claim_deadline) : null;
        let timeRemaining = '';
        if (claimDeadline) {
          const remaining = Math.max(0, Math.floor((claimDeadline - new Date()) / 1000));
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          timeRemaining = `${mins}:${secs.toString().padStart(2, '0')} remaining`;
        }
        roundInfoHtml = `
          <div style="background:var(--accent-orange-soft);border:1px solid var(--accent-orange);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;text-align:center;">
            <div style="font-weight:600;color:var(--accent-orange);margin-bottom:4px;">${mccIcon('search', 16)} Round ${currentRound} of 3</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">Searching for nearby providers... ${timeRemaining}</div>
          </div>
        `;
      }
      
      const timelineHtml = statuses.slice(0, 5).map((status, idx) => {
        const stepClass = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'pending';
        const info = statusLabels[status];
        return `
          <div class="emergency-step ${stepClass}">
            <div class="emergency-step-dot">${info.icon}</div>
            <div class="emergency-step-info">
              <div class="emergency-step-label">${info.label}</div>
            </div>
          </div>
        `;
      }).join('');
      
      document.getElementById('emergency-status-timeline').innerHTML = roundInfoHtml + timelineHtml;
      
      if (e.provider) {
        document.getElementById('emergency-provider-info').style.display = 'block';
        document.getElementById('emergency-provider-info').innerHTML = `
          <div style="font-weight:600;margin-bottom:8px;">Your Provider</div>
          <div style="font-size:1.1rem;margin-bottom:4px;">${e.provider.business_name || e.provider.full_name}</div>
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:8px;width:100%;justify-content:center;">${mccIcon('phone', 16)} Call Provider</a>` : ''}
          ${e.eta_minutes ? `<div style="color:var(--accent-gold);margin-top:8px;">ETA: ${e.eta_minutes} minutes</div>` : ''}
        `;
      }
    }

    function renderEmergencyHistory(emergencies) {
      const container = document.getElementById('emergency-history-list');
      const completed = emergencies.filter(e => ['completed', 'cancelled'].includes(e.status));
      
      if (completed.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${mccIcon('circle-alert', 40)}</div>
            <p>No emergency requests yet.</p>
          </div>
        `;
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
      
      container.innerHTML = completed.map(e => `
        <div style="padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);margin-bottom:12px;border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:1.1rem;">${typeLabels[e.emergency_type] || e.emergency_type}</span>
              <span class="status-badge ${e.status === 'completed' ? 'status-completed' : 'status-cancelled'}" style="margin-left:12px;">${e.status}</span>
            </div>
            <span style="color:var(--text-muted);font-size:0.85rem;">${new Date(e.created_at).toLocaleDateString()}</span>
          </div>
          ${e.vehicles ? `<div style="color:var(--text-secondary);font-size:0.9rem;margin-top:4px;">${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}</div>` : ''}
        </div>
      `).join('');
    }

    async function populateEmergencyVehicles() {
      const select = document.getElementById('emergency-vehicle');
      if (!userVehicles || userVehicles.length === 0) {
        select.innerHTML = '<option value="">No vehicles - add one first</option>';
        return;
      }
      select.innerHTML = '<option value="">Select a vehicle (optional)</option>' + 
        userVehicles.map(v => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`).join('');
    }

    async function openEmergencyStatus() {
      if (!activeEmergency) {
        await checkActiveEmergency();
      }
      
      if (!activeEmergency) {
        showToast('No active emergency', 'error');
        return;
      }
      
      openModal('emergency-status-modal');
      renderEmergencyStatus();
    }

    function renderEmergencyStatus() {
      const e = activeEmergency;
      if (!e) return;
      
      const typeLabels = {
        'flat_tire': mccIcon('settings', 16) + ' Flat Tire',
        'dead_battery': mccIcon('zap', 16) + ' Dead Battery',
        'lockout': mccIcon('lock', 16) + ' Locked Out',
        'tow_needed': mccIcon('truck', 16) + ' Tow Needed',
        'fuel_delivery': mccIcon('fuel', 16) + ' Out of Fuel',
        'accident': mccIcon('circle-alert', 16) + ' Accident',
        'other': mccIcon('circle-help', 16) + ' Other'
      };
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: mccIcon('clock', 16), label: 'Waiting for provider' },
        'accepted': { icon: mccIcon('check', 16), label: 'Provider accepted' },
        'en_route': { icon: mccIcon('car', 16), label: 'Provider en route' },
        'arrived': { icon: mccIcon('map-pin', 16), label: 'Provider arrived' },
        'in_progress': { icon: mccIcon('wrench', 16), label: 'Work in progress' },
        'completed': { icon: mccIcon('check-circle', 16), label: 'Completed' }
      };
      
      const timelineHtml = statuses.slice(0, 5).map((status, idx) => {
        const stepClass = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'pending';
        const info = statusLabels[status];
        return `
          <div class="emergency-step ${stepClass}">
            <div class="emergency-step-dot">${info.icon}</div>
            <div class="emergency-step-info">
              <div class="emergency-step-label">${info.label}</div>
              ${idx === currentIdx && e.accepted_at ? `<div class="emergency-step-time">${new Date(e.accepted_at).toLocaleTimeString()}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      
      const providerHtml = e.provider ? `
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-top:20px;">
          <div style="font-weight:600;margin-bottom:8px;">Your Provider</div>
          <div style="font-size:1.1rem;margin-bottom:4px;">${e.provider.business_name || e.provider.full_name}</div>
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center;">${mccIcon('phone', 16)} Call Provider</a>` : ''}
          ${e.eta_minutes ? `<div style="color:var(--accent-gold);margin-top:12px;">ETA: ${e.eta_minutes} minutes</div>` : ''}
        </div>
      ` : '';
      
      const vehicleName = e.vehicles ? `${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}` : 'No vehicle selected';
      
      document.getElementById('emergency-status-content').innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:32px;margin-bottom:8px;">${typeLabels[e.emergency_type]?.split(' ')[0] || mccIcon('circle-alert', 16)}</div>
          <div style="font-size:1.1rem;font-weight:600;">${typeLabels[e.emergency_type] || e.emergency_type}</div>
          <div style="color:var(--text-muted);font-size:0.9rem;">${vehicleName}</div>
        </div>
        
        <div class="emergency-timeline">${timelineHtml}</div>
        
        ${providerHtml}
        
        ${e.address ? `
          <div style="margin-top:20px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">${mccIcon('map-pin', 16)} Your Location</div>
            <div style="font-size:0.9rem;color:var(--text-secondary);">${e.address}</div>
          </div>
        ` : ''}
        
        ${e.description ? `
          <div style="margin-top:16px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Description</div>
            <div style="font-size:0.9rem;color:var(--text-secondary);">${e.description}</div>
          </div>
        ` : ''}
      `;
      
      document.getElementById('emergency-status-footer').innerHTML = e.status === 'pending' ? `
        <button class="btn btn-danger" onclick="cancelActiveEmergency()">Cancel Request</button>
        <button class="btn btn-secondary" onclick="closeModal('emergency-status-modal')">Close</button>
      ` : `<button class="btn btn-secondary" onclick="closeModal('emergency-status-modal')">Close</button>`;
    }

    async function cancelActiveEmergency() {
      if (!activeEmergency) return;
      if (!confirm('Are you sure you want to cancel this emergency request?')) return;
      
      try {
        const { error } = await cancelEmergency(activeEmergency.id);
        if (error) throw new Error(error);
        
        activeEmergency = null;
        updateEmergencyBanner();
        closeModal('emergency-status-modal');
        loadEmergencySection();
        showToast('Emergency request cancelled', 'success');
      } catch (err) {
        console.error('Error cancelling emergency:', err);
        showToast('Failed to cancel: ' + err.message, 'error');
      }
    }

    // Real-time polling for emergency status updates
    let emergencyPollInterval = null;
    
    async function checkEmergencyRoundExpiry() {
      if (!activeEmergency || activeEmergency.status !== 'pending') return;
      
      const claimDeadline = activeEmergency.claim_deadline ? new Date(activeEmergency.claim_deadline) : null;
      const now = new Date();
      
      if (claimDeadline && claimDeadline <= now) {
        const currentRound = activeEmergency.claim_round || 1;
        
        if (currentRound >= 3) {
          // All 3 rounds exhausted - show fallback message
          showEmergencyNoProvidersMessage();
          return;
        }
        
        // Extend to next round
        const { data, error } = await extendEmergencyRound(activeEmergency.id);
        if (data) {
          activeEmergency = { ...activeEmergency, ...data };
          renderEmergencySectionStatus();
          showToast(`Extending search - Round ${data.claim_round} of 3`, 'info');
        } else if (error && error.roundsExhausted) {
          showEmergencyNoProvidersMessage();
        }
      }
    }
    
    function showEmergencyNoProvidersMessage() {
      const container = document.getElementById('emergency-active-status');
      if (!container) return;
      
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px 24px;">
          <div style="font-size:48px;margin-bottom:16px;">${mccIcon('circle-alert', 40)}</div>
          <h3 style="margin-bottom:12px;color:var(--accent-red);">No Providers Available</h3>
          <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.6;">
            We're sorry, but no providers were able to respond to your emergency request after 15 minutes of searching.
          </p>
          <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:24px;">
            <p style="font-weight:600;margin-bottom:8px;">Alternative Help:</p>
            <p style="color:var(--text-secondary);margin-bottom:12px;">Please try calling 911 or a local towing service.</p>
            <a href="tel:911" class="btn btn-danger" style="width:100%;justify-content:center;margin-bottom:8px;">${mccIcon('phone', 16)} Call 911</a>
          </div>
          <button class="btn btn-secondary" onclick="cancelActiveEmergency()" style="width:100%;justify-content:center;">Cancel Request & Try Again</button>
        </div>
      `;
      
      stopEmergencyPolling();
    }
    
    function startEmergencyPolling() {
      if (emergencyPollInterval) return;
      emergencyPollInterval = setInterval(async () => {
        if (!activeEmergency || !currentUser) return;
        
        // Check for round expiry first
        await checkEmergencyRoundExpiry();
        
        const { data } = await getActiveEmergency(currentUser.id);
        if (data && data.status !== activeEmergency.status) {
          activeEmergency = data;
          renderEmergencySectionStatus();
          updateEmergencyBanner();
          if (data.status === 'completed') {
            showToast('Your emergency service has been completed!', 'success');
            stopEmergencyPolling();
            setTimeout(() => loadEmergencySection(), 2000);
          } else if (data.status === 'accepted') {
            showToast('A provider has accepted your request!', 'success');
          } else if (data.status === 'en_route') {
            showToast('Your provider is on the way!', 'success');
          } else if (data.status === 'arrived') {
            showToast('Your provider has arrived!', 'success');
          }
        } else if (data) {
          // Update activeEmergency even if status hasn't changed (to get latest round info)
          activeEmergency = data;
          renderEmergencySectionStatus();
        }
        if (!data) {
          activeEmergency = null;
          updateEmergencyBanner();
          loadEmergencySection();
          stopEmergencyPolling();
        }
      }, 10000);
    }
    
    function stopEmergencyPolling() {
      if (emergencyPollInterval) {
        clearInterval(emergencyPollInterval);
        emergencyPollInterval = null;
      }
    }

    // ==================== INSPECTION REPORT DISPLAY ====================
    async function loadInspectionReport(packageId) {
      const container = document.getElementById(`inspection-report-content-${packageId}`);
      if (!container) return;
      
      try {
        const { data: inspection, error } = await supabaseClient
          .from('inspection_reports')
          .select('*')
          .eq('package_id', packageId)
          .single();
        
        if (error || !inspection) {
          container.innerHTML = `
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:16px;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">${mccIcon('clipboard-list', 24)}</span>
              No inspection report available yet. Your provider will complete an inspection during service.
            </div>
          `;
          return;
        }
        
        renderInspectionReport(packageId, inspection);
      } catch (err) {
        console.error('Error loading inspection:', err);
        container.innerHTML = `<div style="color:var(--text-muted);font-size:0.9rem;">Could not load inspection report.</div>`;
      }
    }
    
    function renderInspectionReport(packageId, inspection) {
      const container = document.getElementById(`inspection-report-content-${packageId}`);
      if (!container) return;
      
      const conditionLabels = { excellent: 'Excellent', good: 'Good', fair: 'Fair', needs_attention: 'Needs Attention' };
      const statusLabels = { good: 'Good', fair: 'Fair', needs_attention: 'Attention', urgent: 'Urgent', na: 'N/A' };
      const inspectionDate = new Date(inspection.inspection_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const categories = [
        { 
          name: mccIcon('fuel', 16) + ' Fluids', 
          items: [
            { label: 'Engine Oil', field: 'engine_oil' },
            { label: 'Transmission Fluid', field: 'transmission_fluid' },
            { label: 'Coolant Level', field: 'coolant_level' },
            { label: 'Brake Fluid', field: 'brake_fluid' },
            { label: 'Power Steering Fluid', field: 'power_steering_fluid' }
          ]
        },
        { 
          name: mccIcon('settings', 16) + ' Brakes', 
          items: [
            { label: 'Front Brake Pads', field: 'brake_pads_front', extra: inspection.brake_pads_front_percent ? `${inspection.brake_pads_front_percent}%` : null },
            { label: 'Rear Brake Pads', field: 'brake_pads_rear', extra: inspection.brake_pads_rear_percent ? `${inspection.brake_pads_rear_percent}%` : null },
            { label: 'Brake Rotors', field: 'brake_rotors' }
          ]
        },
        { 
          name: mccIcon('car', 16) + ' Tires', 
          items: [
            { label: 'Front Left', field: 'tire_front_left', extra: inspection.tire_front_left_tread ? `${inspection.tire_front_left_tread}/32"` : null },
            { label: 'Front Right', field: 'tire_front_right', extra: inspection.tire_front_right_tread ? `${inspection.tire_front_right_tread}/32"` : null },
            { label: 'Rear Left', field: 'tire_rear_left', extra: inspection.tire_rear_left_tread ? `${inspection.tire_rear_left_tread}/32"` : null },
            { label: 'Rear Right', field: 'tire_rear_right', extra: inspection.tire_rear_right_tread ? `${inspection.tire_rear_right_tread}/32"` : null },
            { label: 'Spare Tire', field: 'spare_tire' }
          ]
        },
        { 
          name: mccIcon('zap', 16) + ' Electrical & Lights', 
          items: [
            { label: 'Battery', field: 'battery', extra: inspection.battery_voltage ? `${inspection.battery_voltage}V` : null },
            { label: 'Headlights', field: 'headlights' },
            { label: 'Taillights', field: 'taillights' },
            { label: 'Turn Signals', field: 'turn_signals' }
          ]
        },
        { 
          name: mccIcon('link', 16) + ' Belts & Hoses', 
          items: [
            { label: 'Serpentine Belt', field: 'serpentine_belt' },
            { label: 'Hoses', field: 'hoses' }
          ]
        },
        { 
          name: mccIcon('sparkles', 16) + ' Wipers & Glass', 
          items: [
            { label: 'Wiper Blades', field: 'wiper_blades' },
            { label: 'Windshield', field: 'windshield' }
          ]
        },
        { 
          name: mccIcon('wrench', 16) + ' Suspension & Steering', 
          items: [
            { label: 'Shocks/Struts', field: 'shocks_struts' },
            { label: 'Alignment', field: 'alignment' }
          ]
        },
        { 
          name: mccIcon('fuel', 16) + ' Filters', 
          items: [
            { label: 'Air Filter', field: 'air_filter' },
            { label: 'Cabin Filter', field: 'cabin_filter' }
          ]
        }
      ];
      
      let categoriesHtml = categories.map(cat => {
        const hasIssues = cat.items.some(item => inspection[item.field] === 'urgent' || inspection[item.field] === 'needs_attention');
        const itemsHtml = cat.items.filter(item => inspection[item.field]).map(item => {
          const status = inspection[item.field];
          return `
            <div class="inspection-item-row">
              <span>${item.label}${item.extra ? ` <span style="color:var(--text-muted);font-size:0.8rem;">(${item.extra})</span>` : ''}</span>
              <span class="inspection-status-badge ${status}">${statusLabels[status] || status}</span>
            </div>
          `;
        }).join('');
        
        if (!itemsHtml) return '';
        
        return `
          <div class="inspection-category-section ${hasIssues ? 'expanded' : ''}">
            <div class="inspection-category-toggle" onclick="this.parentElement.classList.toggle('expanded')">
              <span>${cat.name}</span>
              <span style="font-size:0.8rem;color:var(--text-muted);">${mccIcon('chevron-down', 12)}</span>
            </div>
            <div class="inspection-category-items">${itemsHtml}</div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = `
        <div class="inspection-report-header">
          <div>
            <span class="inspection-overall-badge ${inspection.overall_condition}">${conditionLabels[inspection.overall_condition] || 'N/A'}</span>
            <div class="inspection-date" style="margin-top:8px;">${mccIcon('calendar', 16)} Inspected: ${inspectionDate}</div>
          </div>
        </div>
        
        <div class="inspection-counts">
          ${inspection.urgent_items > 0 ? `<div class="inspection-count-item urgent">${mccIcon('circle-alert', 16)} ${inspection.urgent_items} Urgent</div>` : ''}
          ${inspection.attention_items > 0 ? `<div class="inspection-count-item attention">${mccIcon('alert-triangle', 16)} ${inspection.attention_items} Need Attention</div>` : ''}
          ${!inspection.urgent_items && !inspection.attention_items ? `<div class="inspection-count-item good">${mccIcon('check-circle', 16)} All items in good condition</div>` : ''}
        </div>
        
        ${categoriesHtml}
        
        ${inspection.recommendations ? `
          <div class="inspection-recommendations">
            <div class="inspection-recommendations-title">${mccIcon('lightbulb', 16)} Provider Recommendations</div>
            <div class="inspection-recommendations-text">${inspection.recommendations}</div>
          </div>
        ` : ''}
        
        ${inspection.technician_notes ? `
          <div class="inspection-recommendations" style="margin-top:12px;">
            <div class="inspection-recommendations-title">${mccIcon('file-text', 16)} Technician Notes</div>
            <div class="inspection-recommendations-text">${inspection.technician_notes}</div>
          </div>
        ` : ''}
      `;
    }


    // ==================== HOUSEHOLD MANAGEMENT ====================
    let currentHousehold = null;
    let householdMembers = [];
    let householdVehicles = [];
    let pendingInvitations = [];
    let myMembershipId = null;
    let isHouseholdOwner = false;
    let managingMember = null;

    async function loadHouseholdSection() {
      if (!currentUser) return;
      
      try {
        const { data, error } = await getMyHouseholds(currentUser.id);
        if (error) {
          console.error('Error loading households:', error);
          return;
        }
        
        const pendingBanner = document.getElementById('household-pending-invitations-banner');
        const allMemberships = await checkPendingInvitations();
        
        if (allMemberships.length > 0) {
          pendingBanner.style.display = 'block';
          const roleLabels = { owner: 'Owner', adult: 'Adult', driver: 'Driver', viewer: 'Viewer', member: 'Member' };
          pendingBanner.innerHTML = allMemberships.map(inv => `
            <div class="card" style="background:linear-gradient(135deg, rgba(212,168,85,0.08), rgba(212,168,85,0.03));border:2px solid rgba(212,168,85,0.3);margin-bottom:12px;position:relative;">
              <div style="position:absolute;top:-8px;left:16px;background:var(--accent-gold);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;">${mccIcon('mail', 16)} INVITATION</div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-top:8px;">
                <div style="flex:1;min-width:200px;">
                  <div style="font-size:1.1rem;font-weight:600;margin-bottom:6px;">${inv.household?.name || 'Household'}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span style="font-size:0.85rem;color:var(--text-secondary);">Invited by <strong>${inv.household?.owner?.full_name || 'Owner'}</strong></span>
                    <span style="padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-blue-soft);color:var(--accent-blue);">${roleLabels[inv.role] || 'Member'} Role</span>
                  </div>
                </div>
                <div style="display:flex;gap:10px;">
                  <button class="btn btn-primary" onclick="acceptInvitation('${inv.id}')" style="padding:10px 20px;">${mccIcon('check', 16)} Accept</button>
                  <button class="btn btn-secondary" onclick="declineInvitation('${inv.id}')" style="padding:10px 20px;">${mccIcon('x', 16)} Decline</button>
                </div>
              </div>
            </div>
          `).join('');
        } else {
          pendingBanner.style.display = 'none';
        }
        
        const owned = data.owned || [];
        const memberOf = data.memberOf || [];
        
        if (owned.length === 0 && memberOf.length === 0) {
          document.getElementById('household-no-household').style.display = 'block';
          document.getElementById('household-dashboard').style.display = 'none';
          return;
        }
        
        currentHousehold = owned.length > 0 ? owned[0] : memberOf[0];
        isHouseholdOwner = owned.length > 0 && owned[0].id === currentHousehold.id;
        
        if (memberOf.length > 0 && !isHouseholdOwner) {
          myMembershipId = currentHousehold.membership?.id;
        }
        
        document.getElementById('household-no-household').style.display = 'none';
        document.getElementById('household-dashboard').style.display = 'block';
        
        await loadHouseholdDetails(currentHousehold.id);
        
      } catch (err) {
        console.error('Error loading household section:', err);
      }
    }

    async function checkPendingInvitations() {
      if (!currentUser) return [];
      
      const { data } = await supabaseClient
        .from('household_members')
        .select(`
          *,
          household:household_id(name, owner_id, owner:owner_id(full_name))
        `)
        .eq('email', currentUser.email)
        .eq('status', 'pending');
      
      return data || [];
    }

    async function loadHouseholdDetails(householdId) {
      const { data, error } = await getHouseholdDetails(householdId);
      if (error) {
        console.error('Error loading household details:', error);
        return;
      }
      
      currentHousehold = data;
      householdMembers = data.members || [];
      
      document.getElementById('household-name-display').textContent = data.name;
      
      const memberCount = householdMembers.filter(m => m.status === 'active').length + 1;
      document.getElementById('household-member-count-badge').innerHTML = `${mccIcon('users', 16)} ${memberCount} member${memberCount !== 1 ? 's' : ''}`;
      
      document.getElementById('household-role-display').textContent = isHouseholdOwner ? 'Owner' : 
        (householdMembers.find(m => m.user_id === currentUser.id)?.role || 'Member');
      
      if (isHouseholdOwner) {
        document.getElementById('edit-household-btn').style.display = 'inline-flex';
        document.getElementById('invite-member-btn').style.display = 'inline-flex';
        document.getElementById('share-vehicle-btn').style.display = 'inline-flex';
      } else {
        document.getElementById('edit-household-btn').style.display = 'none';
        document.getElementById('invite-member-btn').style.display = 'none';
        document.getElementById('share-vehicle-btn').style.display = 'none';
      }
      
      renderHouseholdMembers();
      renderPendingInvitations();
      await loadHouseholdVehicles(householdId);
      await loadHouseholdActivity();
    }

    function renderHouseholdMembers() {
      const grid = document.getElementById('household-members-grid');
      
      const roleColors = {
        owner: 'var(--accent-gold)',
        adult: 'var(--accent-blue)',
        driver: 'var(--accent-green)',
        viewer: 'var(--text-muted)'
      };
      
      const roleLabels = {
        owner: 'Owner',
        adult: 'Adult',
        driver: 'Driver',
        viewer: 'Viewer',
        member: 'Member'
      };
      
      let membersHtml = '';
      
      if (currentHousehold.owner) {
        const owner = currentHousehold.owner;
        const initial = (owner.full_name || owner.email || 'O').charAt(0).toUpperCase();
        const isCurrentUserOwner = currentUser && owner.id === currentUser.id;
        membersHtml += `
          <div style="background:var(--bg-elevated);border:2px solid var(--accent-gold);border-radius:var(--radius-lg);padding:20px;position:relative;">
            <div style="position:absolute;top:-8px;right:16px;background:linear-gradient(135deg, var(--accent-gold), #e8bc5a);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${mccIcon('award', 16)} Owner</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:52px;height:52px;background:linear-gradient(135deg, var(--accent-gold), #e8bc5a);border:3px solid rgba(212,168,85,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#0a0a0f;box-shadow:0 4px 12px rgba(212,168,85,0.3);">
                ${initial}
              </div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:600;font-size:1.05rem;">${owner.full_name || 'Owner'}</span>
                  ${isCurrentUserOwner ? '<span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-blue-soft);color:var(--accent-blue);">You</span>' : ''}
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${owner.email || ''}</div>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">${mccIcon('file-text', 16)} Can Request</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">${mccIcon('check', 16)} Can Approve</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">${mccIcon('lock', 16)} Full Access</span>
            </div>
          </div>
        `;
      }
      
      const activeMembers = householdMembers.filter(m => m.status === 'active');
      activeMembers.forEach(member => {
        const user = member.user || {};
        const name = user.full_name || member.email || 'Member';
        const email = user.email || member.email || '';
        const initial = name.charAt(0).toUpperCase();
        const role = member.role || 'member';
        const roleColor = roleColors[role] || roleColors.viewer;
        const perms = member.permissions || {};
        
        let permsBadges = [];
        if (perms.can_request_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">' + mccIcon('file-text', 16) + ' Can Request</span>');
        if (perms.can_approve_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">' + mccIcon('check', 16) + ' Can Approve</span>');
        if (perms.spending_limit) permsBadges.push(`<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">${mccIcon('dollar-sign', 16)} $${perms.spending_limit} limit</span>`);
        
        const manageBtn = isHouseholdOwner ? `<button class="btn btn-ghost btn-sm" onclick="openManageMemberModal('${member.id}')">Manage</button>` : '';
        
        membersHtml += `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:48px;height:48px;background:linear-gradient(135deg, ${roleColor}44, ${roleColor}22);border:2px solid ${roleColor}44;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:${roleColor};">
                ${initial}
              </div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:600;">${name}</span>
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.68rem;font-weight:500;background:var(--accent-green-soft);color:var(--accent-green);">Active</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${email}</div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${permsBadges.length > 0 ? '12px' : '0'};">
              <span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;background:${roleColor}22;color:${roleColor};">
                ${roleLabels[role] || role}
              </span>
              ${manageBtn}
            </div>
            ${permsBadges.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${permsBadges.join('')}</div>` : ''}
          </div>
        `;
      });
      
      grid.innerHTML = membersHtml || '<div class="empty-state" style="grid-column:1/-1;padding:32px;"><div class="empty-state-icon">' + mccIcon('users', 40) + '</div><p>No members yet.</p></div>';
    }

    function renderPendingInvitations() {
      const pendingSection = document.getElementById('household-pending-section');
      const pendingList = document.getElementById('household-pending-list');
      
      const pending = householdMembers.filter(m => m.status === 'pending');
      
      if (!isHouseholdOwner || pending.length === 0) {
        pendingSection.style.display = 'none';
        return;
      }
      
      const roleLabels = { owner: 'Owner', adult: 'Adult', driver: 'Driver', viewer: 'Viewer', member: 'Member' };
      const roleColors = { owner: 'var(--accent-gold)', adult: 'var(--accent-blue)', driver: 'var(--accent-green)', viewer: 'var(--text-muted)', member: 'var(--text-secondary)' };
      
      pendingSection.style.display = 'block';
      pendingList.innerHTML = pending.map(inv => {
        const role = inv.role || 'member';
        const roleColor = roleColors[role] || roleColors.member;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:40px;height:40px;background:var(--accent-orange-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-orange);">${mccIcon('mail', 16)}</div>
              <div style="flex:1;">
                <div style="font-weight:500;margin-bottom:4px;">${inv.email}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);">${mccIcon('clock', 16)} Pending</span>
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:500;background:${roleColor}22;color:${roleColor};">${roleLabels[role] || 'Member'}</span>
                </div>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="cancelInvitation('${inv.id}')" title="Cancel invitation">${mccIcon('x', 16)} Cancel</button>
          </div>
        `;
      }).join('');
    }

    async function loadHouseholdVehicles(householdId) {
      const { data, error } = await getHouseholdVehicles(householdId);
      if (error) {
        console.error('Error loading household vehicles:', error);
        return;
      }
      
      householdVehicles = data || [];
      
      const vehicleCountBadge = document.getElementById('household-vehicle-count-badge');
      if (vehicleCountBadge) {
        vehicleCountBadge.innerHTML = `${mccIcon('car', 16)} ${householdVehicles.length} vehicle${householdVehicles.length !== 1 ? 's' : ''}`;
      }
      
      renderHouseholdVehicles();
    }

    function renderHouseholdVehicles() {
      const grid = document.getElementById('household-vehicles-grid');
      
      if (householdVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:32px;">
            <div class="empty-state-icon">${mccIcon('car', 40)}</div>
            <p>No vehicles shared yet.</p>
            ${isHouseholdOwner ? '<button class="btn btn-secondary" onclick="openShareVehicleModal()" style="margin-top:12px;">+ Share a Vehicle</button>' : ''}
          </div>
        `;
        return;
      }
      
      const accessColors = {
        full: 'var(--accent-green)',
        request: 'var(--accent-orange)',
        view: 'var(--text-muted)'
      };
      
      const accessLabels = {
        full: 'Full Access',
        request: 'Request Only',
        view: 'View Only'
      };
      
      grid.innerHTML = householdVehicles.map(hv => {
        const v = hv.vehicle || {};
        const vehicleName = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
        const sharedBy = hv.shared_by_user?.full_name || 'Owner';
        const accessLevel = hv.access_level || 'view';
        const accessColor = accessColors[accessLevel] || accessColors.view;
        
        const canManage = isHouseholdOwner || hv.shared_by === currentUser.id;
        const canRequestService = !isHouseholdOwner && (accessLevel === 'full' || accessLevel === 'request');
        const isViewOnly = accessLevel === 'view' && !isHouseholdOwner;
        
        let actionButtons = '';
        if (canManage) {
          actionButtons = `<button class="btn btn-ghost btn-sm" onclick="removeSharedVehicle('${hv.id}')">Remove</button>`;
        } else if (canRequestService) {
          actionButtons = `<button class="btn btn-primary btn-sm" onclick="requestServiceForHouseholdVehicle('${v.id}', '${vehicleName}')">Request Service</button>`;
        } else if (isViewOnly) {
          actionButtons = `<span style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">${mccIcon('eye', 16)} View Only</span>`;
        }
        
        return `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden;transition:all 0.2s;" class="household-vehicle-card">
            <div style="height:140px;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));display:flex;align-items:center;justify-content:center;font-size:56px;position:relative;">
              ${mccIcon('car', 16)}
              <span style="position:absolute;top:12px;right:12px;padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${accessColor}22;color:${accessColor};">
                ${accessLabels[accessLevel]}
              </span>
            </div>
            <div style="padding:16px;">
              <div style="font-weight:600;font-size:1.05rem;margin-bottom:4px;">${vehicleName}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">Shared by ${sharedBy}</div>
              <div style="display:flex;justify-content:flex-end;align-items:center;padding-top:12px;border-top:1px solid var(--border-subtle);">
                ${actionButtons}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    async function createNewHousehold() {
      const name = document.getElementById('create-household-name').value.trim();
      if (!name) {
        showToast('Please enter a household name', 'error');
        return;
      }
      
      const { data, error } = await createHousehold(name, currentUser.id);
      if (error) {
        showToast('Failed to create household: ' + error.message, 'error');
        return;
      }
      
      showToast('Household created successfully!', 'success');
      document.getElementById('create-household-name').value = '';
      isHouseholdOwner = true;
      await loadHouseholdSection();
    }

    function openInviteMemberModal() {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-role').value = 'adult';
      document.getElementById('perm-request-services').checked = true;
      document.getElementById('perm-approve-services').checked = false;
      document.getElementById('invite-spending-limit').value = '';
      updateInvitePermissions();
      openModal('invite-member-modal');
    }

    function updateInvitePermissions() {
      const role = document.getElementById('invite-role').value;
      const approveContainer = document.getElementById('perm-approve-container');
      const requestCheckbox = document.getElementById('perm-request-services');
      const approveCheckbox = document.getElementById('perm-approve-services');
      
      if (role === 'viewer') {
        requestCheckbox.checked = false;
        requestCheckbox.disabled = true;
        approveCheckbox.checked = false;
        approveContainer.style.display = 'none';
      } else if (role === 'driver') {
        requestCheckbox.checked = true;
        requestCheckbox.disabled = false;
        approveCheckbox.checked = false;
        approveContainer.style.display = 'none';
      } else {
        requestCheckbox.checked = true;
        requestCheckbox.disabled = false;
        approveContainer.style.display = 'flex';
      }
    }

    async function sendHouseholdInvitation() {
      const email = document.getElementById('invite-email').value.trim();
      const role = document.getElementById('invite-role').value;
      
      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }
      
      if (!email.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return;
      }
      
      const permissions = {
        can_request_services: document.getElementById('perm-request-services').checked,
        can_approve_services: document.getElementById('perm-approve-services').checked,
        spending_limit: document.getElementById('invite-spending-limit').value ? 
          Number.parseFloat(document.getElementById('invite-spending-limit').value) : null
      };
      
      const { data, error } = await inviteHouseholdMember(currentHousehold.id, email, role, currentUser.id);
      
      if (error) {
        showToast('Failed to send invitation: ' + error.message, 'error');
        return;
      }
      
      if (data && permissions) {
        await updateHouseholdMemberPermissions(data.id, permissions);
      }
      
      showToast('Invitation sent successfully!', 'success');
      closeModal('invite-member-modal');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function cancelInvitation(membershipId) {
      if (!confirm('Cancel this invitation?')) return;
      
      const { error } = await removeHouseholdMember(membershipId);
      if (error) {
        showToast('Failed to cancel invitation', 'error');
        return;
      }
      
      showToast('Invitation cancelled', 'success');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function acceptInvitation(membershipId) {
      const { data, error } = await acceptHouseholdInvitation(membershipId);
      if (error) {
        showToast('Failed to accept invitation: ' + error.message, 'error');
        return;
      }
      
      showToast('You have joined the household!', 'success');
      await loadHouseholdSection();
    }

    async function declineInvitation(membershipId) {
      if (!confirm('Decline this invitation?')) return;
      
      const { error } = await removeHouseholdMember(membershipId);
      if (error) {
        showToast('Failed to decline invitation', 'error');
        return;
      }
      
      showToast('Invitation declined', 'success');
      await loadHouseholdSection();
    }

    function openShareVehicleModal() {
      const select = document.getElementById('share-vehicle-select');
      
      const sharedVehicleIds = householdVehicles.map(hv => hv.vehicle_id);
      const availableVehicles = vehicles.filter(v => !sharedVehicleIds.includes(v.id));
      
      if (availableVehicles.length === 0) {
        showToast('All your vehicles are already shared with this household', 'error');
        return;
      }
      
      select.innerHTML = '<option value="">Choose a vehicle...</option>' + 
        availableVehicles.map(v => `<option value="${v.id}">${v.nickname || `${v.year || ''} ${v.make} ${v.model}`.trim()}</option>`).join('');
      
      document.querySelectorAll('input[name="access-level"]').forEach(r => r.checked = false);
      document.querySelectorAll('.access-level-option').forEach(opt => {
        opt.style.borderColor = 'var(--border-subtle)';
      });
      
      openModal('share-vehicle-modal');
    }

    function selectAccessLevel(level) {
      document.querySelectorAll('.access-level-option').forEach(opt => {
        opt.style.borderColor = 'var(--border-subtle)';
      });
      const selected = document.querySelector(`input[name="access-level"][value="${level}"]`);
      if (selected) {
        selected.checked = true;
        selected.closest('.access-level-option').style.borderColor = 'var(--accent-gold)';
      }
    }

    async function shareVehicle() {
      const vehicleId = document.getElementById('share-vehicle-select').value;
      const accessLevel = document.querySelector('input[name="access-level"]:checked')?.value;
      
      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }
      
      if (!accessLevel) {
        showToast('Please select an access level', 'error');
        return;
      }
      
      const { data, error } = await shareVehicleWithHousehold(currentHousehold.id, vehicleId, accessLevel, currentUser.id);
      
      if (error) {
        showToast('Failed to share vehicle: ' + error.message, 'error');
        return;
      }
      
      showToast('Vehicle shared successfully!', 'success');
      closeModal('share-vehicle-modal');
      await loadHouseholdVehicles(currentHousehold.id);
    }

    async function removeSharedVehicle(accessId) {
      if (!confirm('Remove this vehicle from household sharing?')) return;
      
      const { error } = await removeVehicleFromHousehold(accessId);
      if (error) {
        showToast('Failed to remove vehicle', 'error');
        return;
      }
      
      showToast('Vehicle removed from household', 'success');
      await loadHouseholdVehicles(currentHousehold.id);
    }

    function requestServiceForHouseholdVehicle(vehicleId, vehicleName) {
      showSection('packages');
      setTimeout(() => {
        openNewPackageModal();
        const vehicleSelect = document.getElementById('p-vehicle');
        if (vehicleSelect) {
          for (let i = 0; i < vehicleSelect.options.length; i++) {
            if (vehicleSelect.options[i].value === vehicleId) {
              vehicleSelect.selectedIndex = i;
              break;
            }
          }
        }
        showToast(`Creating service request for ${vehicleName}`, 'success');
      }, 200);
    }

    function openManageMemberModal(membershipId) {
      managingMember = householdMembers.find(m => m.id === membershipId);
      if (!managingMember) return;
      
      const user = managingMember.user || {};
      const name = user.full_name || managingMember.email || 'Member';
      const perms = managingMember.permissions || {};
      
      document.getElementById('manage-member-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:48px;height:48px;background:var(--accent-blue-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:var(--accent-blue);">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">${user.email || managingMember.email || ''}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="manage-role">
            <option value="adult" ${managingMember.role === 'adult' ? 'selected' : ''}>Adult</option>
            <option value="driver" ${managingMember.role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="viewer" ${managingMember.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">Permissions</div>
          <div style="display:grid;gap:12px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="manage-perm-request" ${perms.can_request_services ? 'checked' : ''}>
              <span>Can request services</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="manage-perm-approve" ${perms.can_approve_services ? 'checked' : ''}>
              <span>Can approve services</span>
            </label>
          </div>
          
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Spending Limit</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:var(--text-muted);">$</span>
              <input type="number" class="form-input" id="manage-spending-limit" placeholder="No limit" value="${perms.spending_limit || ''}" style="max-width:150px;">
              <span style="color:var(--text-muted);font-size:0.85rem;">per service</span>
            </div>
          </div>
        </div>
      `;
      
      openModal('manage-member-modal');
    }

    async function saveMemberPermissions() {
      if (!managingMember) return;
      
      const role = document.getElementById('manage-role').value;
      const permissions = {
        can_request_services: document.getElementById('manage-perm-request').checked,
        can_approve_services: document.getElementById('manage-perm-approve').checked,
        spending_limit: document.getElementById('manage-spending-limit').value ? 
          Number.parseFloat(document.getElementById('manage-spending-limit').value) : null
      };
      
      await supabaseClient
        .from('household_members')
        .update({ role: role })
        .eq('id', managingMember.id);
      
      await updateHouseholdMemberPermissions(managingMember.id, permissions);
      
      showToast('Member permissions updated', 'success');
      closeModal('manage-member-modal');
      managingMember = null;
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function removeMemberFromHousehold() {
      if (!managingMember) return;
      
      const name = managingMember.user?.full_name || managingMember.email || 'this member';
      if (!confirm(`Remove ${name} from the household?`)) return;
      
      const { error } = await removeHouseholdMember(managingMember.id);
      if (error) {
        showToast('Failed to remove member', 'error');
        return;
      }
      
      showToast('Member removed from household', 'success');
      closeModal('manage-member-modal');
      managingMember = null;
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function editHouseholdName() {
      const newName = prompt('Enter new household name:', currentHousehold.name);
      if (!newName || newName.trim() === currentHousehold.name) return;
      
      const { error } = await supabaseClient
        .from('households')
        .update({ name: newName.trim() })
        .eq('id', currentHousehold.id);
      
      if (error) {
        showToast('Failed to update household name', 'error');
        return;
      }
      
      showToast('Household name updated', 'success');
      await loadHouseholdDetails(currentHousehold.id);
    }

    async function loadHouseholdActivity() {
      if (!currentHousehold) return;
      
      const activityList = document.getElementById('household-activity-list');
      if (!activityList) return;
      
      try {
        const memberUserIds = householdMembers
          .filter(m => m.status === 'active' && m.user_id)
          .map(m => m.user_id);
        
        if (isHouseholdOwner && currentUser) {
          memberUserIds.push(currentUser.id);
        }
        
        const sharedVehicleIds = householdVehicles.map(hv => hv.vehicle_id);
        
        if (memberUserIds.length === 0 && sharedVehicleIds.length === 0) {
          activityList.innerHTML = `
            <div class="empty-state" style="padding:24px;">
              <div class="empty-state-icon">${mccIcon('bar-chart', 40)}</div>
              <p>No recent activity.</p>
              <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Service requests from household members will appear here.</p>
            </div>
          `;
          return;
        }
        
        let query = supabaseClient
          .from('maintenance_packages')
          .select(`
            id, title, status, created_at,
            member:member_id(id, full_name, email),
            vehicle:vehicle_id(year, make, model)
          `)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (sharedVehicleIds.length > 0) {
          query = query.in('vehicle_id', sharedVehicleIds);
        } else if (memberUserIds.length > 0) {
          query = query.in('member_id', memberUserIds);
        }
        
        const { data: activity, error } = await query;
        
        if (error || !activity || activity.length === 0) {
          activityList.innerHTML = `
            <div class="empty-state" style="padding:24px;">
              <div class="empty-state-icon">${mccIcon('bar-chart', 40)}</div>
              <p>No recent activity.</p>
              <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Service requests from household members will appear here.</p>
            </div>
          `;
          return;
        }
        
        const statusColors = {
          open: { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', label: 'Open' },
          pending: { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', label: 'Pending' },
          accepted: { bg: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', label: 'Accepted' },
          in_progress: { bg: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', label: 'In Progress' },
          completed: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: 'Completed' },
          cancelled: { bg: 'rgba(239,95,95,0.15)', color: 'var(--accent-red)', label: 'Cancelled' }
        };
        
        activityList.innerHTML = activity.map(item => {
          const memberName = item.member?.full_name || item.member?.email || 'Unknown';
          const vehicleName = item.vehicle ? `${item.vehicle.year || ''} ${item.vehicle.make || ''} ${item.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
          const status = statusColors[item.status] || statusColors.pending;
          const initial = memberName.charAt(0).toUpperCase();
          const date = new Date(item.created_at);
          const timeAgo = getTimeAgo(date);
          const isCurrentUser = currentUser && item.member?.id === currentUser.id;
          
          return `
            <div style="display:flex;gap:16px;padding:16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:12px;transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent-gold)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
              <div style="width:44px;height:44px;background:linear-gradient(135deg, var(--accent-gold-soft), var(--accent-blue-soft));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:var(--accent-gold);flex-shrink:0;">
                ${initial}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
                  <div style="flex:1;min-width:0;">
                    <span style="font-weight:600;color:var(--text-primary);">${isCurrentUser ? 'You' : memberName}</span>
                    <span style="color:var(--text-muted);font-size:0.9rem;"> requested service</span>
                  </div>
                  <span style="padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${status.bg};color:${status.color};white-space:nowrap;">${status.label}</span>
                </div>
                <div style="font-size:0.92rem;color:var(--text-secondary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  <span style="color:var(--accent-gold);">${mccIcon('package', 16)}</span> ${item.title}
                </div>
                <div style="display:flex;align-items:center;gap:12px;font-size:0.82rem;color:var(--text-muted);">
                  <span>${mccIcon('car', 16)} ${vehicleName}</span>
                  <span>•</span>
                  <span>${timeAgo}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
        
      } catch (err) {
        console.error('Error loading household activity:', err);
        activityList.innerHTML = `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-state-icon">${mccIcon('alert-triangle', 40)}</div>
            <p>Could not load activity.</p>
          </div>
        `;
      }
    }

    function getTimeAgo(date) {
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    }

    async function refreshHouseholdActivity() {
      await loadHouseholdActivity();
      showToast('Activity refreshed', 'success');
    }

    // ========== FLEET MANAGEMENT ==========
    
    async function loadFleetSection() {
      if (!currentUser) return;
      
      const { owned, memberOf } = await getMyFleets(currentUser.id);
      const allFleets = [...(owned || []), ...(memberOf || [])];
      
      if (allFleets.length === 0) {
        document.getElementById('fleet-no-fleet').style.display = 'block';
        document.getElementById('fleet-dashboard').style.display = 'none';
        return;
      }
      
      currentFleet = owned && owned.length > 0 ? owned[0] : (memberOf && memberOf.length > 0 ? memberOf[0] : null);
      
      if (currentFleet) {
        document.getElementById('fleet-no-fleet').style.display = 'none';
        document.getElementById('fleet-dashboard').style.display = 'block';
        await loadFleetDetails(currentFleet.id);
      } else {
        document.getElementById('fleet-no-fleet').style.display = 'block';
        document.getElementById('fleet-dashboard').style.display = 'none';
      }
    }
    
    let currentFleetVehicleFilter = 'all';
    let fleetPendingApprovals = [];
    
    async function loadFleetDetails(fleetId) {
      const { data, error } = await getFleetDetails(fleetId);
      if (error || !data) {
        console.error('Error loading fleet details:', error);
        return;
      }
      
      currentFleet = data;
      fleetMembers = data.members || [];
      fleetVehicles = data.vehicles || [];
      
      document.getElementById('fleet-name-display').textContent = data.name || data.company_name || 'Unnamed Fleet';
      document.getElementById('fleet-business-type-badge').textContent = formatBusinessType(data.business_type);
      document.getElementById('fleet-member-count-badge').textContent = `${fleetMembers.length} Member${fleetMembers.length !== 1 ? 's' : ''}`;
      document.getElementById('fleet-vehicle-count-badge').textContent = `${fleetVehicles.length} Vehicle${fleetVehicles.length !== 1 ? 's' : ''}`;
      
      const fleetCountBadge = document.getElementById('fleet-count');
      if (fleetCountBadge) {
        fleetCountBadge.textContent = fleetVehicles.length;
        fleetCountBadge.style.display = fleetVehicles.length > 0 ? 'inline-flex' : 'none';
      }
      
      if (data.billing_email || data.address || data.tax_id) {
        document.getElementById('fleet-company-info').style.display = 'block';
        document.getElementById('fleet-billing-email-display').innerHTML = data.billing_email ? `${mccIcon('mail', 16)} ${data.billing_email}` : '';
        document.getElementById('fleet-address-display').innerHTML = data.address ? `${mccIcon('map-pin', 16)} ${data.address}` : '';
        const taxIdEl = document.getElementById('fleet-tax-id-display');
        if (taxIdEl) taxIdEl.innerHTML = data.tax_id ? `${mccIcon('store', 16)} Tax ID: ${data.tax_id}` : '';
      } else {
        document.getElementById('fleet-company-info').style.display = 'none';
      }
      
      updateFleetStats();
      renderFleetMembers();
      renderFleetVehicles();
      await loadBulkBatches();
      await loadFleetApprovals();
    }
    
    function updateFleetStats() {
      const activeServices = fleetVehicles.filter(fv => fv.vehicle?.health_status === 'in_service').length;
      const pendingCount = fleetPendingApprovals.length;
      
      document.getElementById('fleet-stat-active-services').textContent = activeServices;
      document.getElementById('fleet-stat-pending-approvals').textContent = pendingCount;
      document.getElementById('fleet-stat-total-vehicles').textContent = fleetVehicles.length;
      document.getElementById('fleet-stat-team-size').textContent = fleetMembers.length;
    }
    
    async function loadFleetApprovals() {
      if (!currentFleet || !currentUser) return;
      
      const isOwnerOrManager = currentFleet.owner_id === currentUser.id || 
        fleetMembers.some(m => m.user_id === currentUser.id && (m.role === 'owner' || m.role === 'manager'));
      
      const approvalSection = document.getElementById('fleet-approval-queue-section');
      if (!approvalSection) return;
      
      if (!isOwnerOrManager) {
        approvalSection.style.display = 'none';
        return;
      }
      
      const { data: approvals, error } = await supabaseClient
        .from('maintenance_packages')
        .select('*, vehicles(*), profiles:member_id(*)')
        .eq('fleet_id', currentFleet.id)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });
      
      fleetPendingApprovals = approvals || [];
      updateFleetStats();
      
      if (fleetPendingApprovals.length === 0) {
        approvalSection.style.display = 'none';
        return;
      }
      
      approvalSection.style.display = 'block';
      renderFleetApprovals();
    }
    
    function renderFleetApprovals() {
      const container = document.getElementById('fleet-approval-queue-list');
      if (!container) return;
      
      if (fleetPendingApprovals.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-state-icon">${mccIcon('check-circle', 40)}</div>
            <p>No pending approvals.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = fleetPendingApprovals.map(pkg => {
        const v = pkg.vehicles || {};
        const requester = pkg.profiles || {};
        const vehicleName = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();
        const requesterName = requester.full_name || requester.email || 'Unknown';
        
        return `
          <div class="batch-card" style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;font-size:1rem;margin-bottom:4px;">${pkg.title || 'Service Request'}</div>
                <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:8px;">${vehicleName}</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.85rem;color:var(--text-muted);">
                  <span>${mccIcon('user', 16)} ${requesterName}</span>
                  ${pkg.estimated_cost ? `<span>${mccIcon('dollar-sign', 16)} ~$${Number(pkg.estimated_cost).toLocaleString()}</span>` : ''}
                  <span>${mccIcon('calendar', 16)} ${new Date(pkg.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-success btn-sm" onclick="approveFleetServiceRequest('${pkg.id}')">${mccIcon('check', 16)} Approve</button>
                <button class="btn btn-danger btn-sm" onclick="rejectFleetServiceRequest('${pkg.id}')">${mccIcon('x', 16)} Reject</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    async function approveFleetServiceRequest(packageId) {
      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ status: 'open', approved_at: new Date().toISOString(), approved_by: currentUser.id })
        .eq('id', packageId);
      
      if (error) {
        showToast('Failed to approve request', 'error');
        return;
      }
      
      showToast('Service request approved!', 'success');
      await loadFleetApprovals();
    }
    
    async function rejectFleetServiceRequest(packageId) {
      if (!confirm('Reject this service request?')) return;
      
      const { error } = await supabaseClient
        .from('maintenance_packages')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: currentUser.id })
        .eq('id', packageId);
      
      if (error) {
        showToast('Failed to reject request', 'error');
        return;
      }
      
      showToast('Service request rejected', 'success');
      await loadFleetApprovals();
    }
    
    async function refreshFleetApprovals() {
      await loadFleetApprovals();
      showToast('Approval queue refreshed', 'success');
    }
    
    function filterFleetVehicles(filter) {
      currentFleetVehicleFilter = filter;
      
      document.querySelectorAll('#fleet-vehicle-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.fleetFilter === filter) tab.classList.add('active');
      });
      
      renderFleetVehicles();
    }
    
    function formatBusinessType(type) {
      const types = {
        rental: 'Rental',
        corporate: 'Corporate',
        delivery: 'Delivery',
        rideshare: 'Rideshare',
        logistics: 'Logistics',
        small_business: 'Small Business',
        government: 'Government',
        nonprofit: 'Non-Profit',
        other: 'Other'
      };
      return types[type] || type || 'Business';
    }
    
    function renderFleetMembers() {
      const tbody = document.getElementById('fleet-members-tbody');
      if (!tbody) return;
      
      if (fleetMembers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">
              <div style="font-size:32px;margin-bottom:8px;">${mccIcon('users', 16)}</div>
              No fleet members yet. Add your first employee.
            </td>
          </tr>
        `;
        return;
      }
      
      tbody.innerHTML = fleetMembers.map(member => {
        const profile = member.user || {};
        const name = profile.full_name || member.email || 'Unknown';
        const email = profile.email || member.email || '-';
        const role = member.role || 'driver';
        const status = member.status || 'active';
        
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:36px;height:36px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                  ${name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight:500;">${name}</div>
                  <div style="font-size:0.82rem;color:var(--text-muted);">${email}</div>
                </div>
              </div>
            </td>
            <td><span class="fleet-role-badge ${role}">${role}</span></td>
            <td>${member.employee_id || '-'}</td>
            <td>${member.department || '-'}</td>
            <td>${member.spending_limit ? '$' + Number(member.spending_limit).toLocaleString() : 'No limit'}</td>
            <td>
              ${member.requires_approval 
                ? '<span class="approval-indicator">' + mccIcon('alert-triangle', 16) + ' Required</span>' 
                : '<span class="approval-indicator no-approval">' + mccIcon('check', 16) + ' Auto</span>'}
            </td>
            <td><span class="fleet-status-badge ${status}">${status}</span></td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="openEditFleetEmployee('${member.id}')" title="Edit">${mccIcon('file-text', 16)}</button>
                ${status === 'active' 
                  ? `<button class="btn btn-ghost btn-sm" onclick="suspendFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Suspend" style="color:var(--accent-orange);">` + mccIcon('pause', 14) + `</button>`
                  : `<button class="btn btn-ghost btn-sm" onclick="activateFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Activate" style="color:var(--accent-green);">` + mccIcon('play', 14) + `</button>`
                }
                <button class="btn btn-ghost btn-sm" onclick="confirmRemoveFleetEmployee('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Remove" style="color:var(--accent-red);">${mccIcon('x', 16)}</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    function renderFleetVehicles() {
      const grid = document.getElementById('fleet-vehicles-grid');
      if (!grid) return;
      
      let filteredVehicles = fleetVehicles;
      
      if (currentFleetVehicleFilter === 'assigned') {
        filteredVehicles = fleetVehicles.filter(fv => fv.assigned_driver_id && fv.assignment_type !== 'pool');
      } else if (currentFleetVehicleFilter === 'pool') {
        filteredVehicles = fleetVehicles.filter(fv => fv.assignment_type === 'pool' || !fv.assigned_driver_id);
      } else if (currentFleetVehicleFilter === 'needs_service') {
        filteredVehicles = fleetVehicles.filter(fv => {
          const v = fv.vehicle || {};
          return v.health_status === 'needs_attention' || v.health_status === 'poor' || v.health_status === 'fair';
        });
      }
      
      if (fleetVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:32px;">
            <div class="empty-state-icon">${mccIcon('car', 40)}</div>
            <p>No vehicles in fleet yet.</p>
            <button class="btn btn-primary btn-sm" onclick="openAddFleetVehicleModal()" style="margin-top:12px;">+ Add First Vehicle</button>
          </div>
        `;
        return;
      }
      
      if (filteredVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:24px;">
            <div class="empty-state-icon">${mccIcon('search', 40)}</div>
            <p>No vehicles match this filter.</p>
          </div>
        `;
        return;
      }
      
      grid.innerHTML = filteredVehicles.map(fv => {
        const v = fv.vehicle || {};
        const driver = fv.assigned_driver;
        const driverName = driver?.full_name || 'Pool Vehicle';
        const assignment = fv.assignment_type || 'pool';
        const healthStatus = v.health_status || 'good';
        const needsService = healthStatus === 'needs_attention' || healthStatus === 'poor' || healthStatus === 'fair';
        
        return `
          <div class="fleet-vehicle-card">
            <div class="fleet-vehicle-photo">
              ${v.photo_url 
                ? `<img src="${v.photo_url}" alt="${v.make} ${v.model}">` 
                : mccIcon('car', 16)}
              <span class="fleet-assignment-badge ${assignment}" style="position:absolute;top:8px;right:8px;">${assignment}</span>
              ${needsService ? `<span class="fleet-assignment-badge" style="position:absolute;top:8px;left:8px;background:rgba(239,95,95,0.9);color:#fff;">${mccIcon('alert-triangle', 16)} Needs Service</span>` : ''}
            </div>
            <div class="fleet-vehicle-body">
              <div class="fleet-vehicle-title">${v.year || ''} ${v.make || ''} ${v.model || ''}</div>
              <div class="fleet-vehicle-driver">${mccIcon('user', 16)} ${driverName}</div>
              <div class="fleet-vehicle-meta">
                ${fv.department ? `<span style="font-size:0.78rem;color:var(--text-muted);">${mccIcon('folder-open', 16)} ${fv.department}</span>` : ''}
                <span class="fleet-status-badge ${healthStatus === 'excellent' || healthStatus === 'good' ? 'active' : healthStatus === 'fair' ? 'pending' : 'inactive'}" style="font-size:0.7rem;">${healthStatus}</span>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openEditFleetVehicle('${fv.id}')">${mccIcon('file-text', 16)} Edit</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    async function loadBulkBatches() {
      if (!currentFleet) return;
      
      const { data, error } = await getFleetBulkBatches(currentFleet.id);
      if (error) {
        console.error('Error loading bulk batches:', error);
        return;
      }
      
      bulkBatches = data || [];
      renderBulkBatches();
    }
    
    function renderBulkBatches() {
      const container = document.getElementById('bulk-batches-list');
      if (!container) return;
      
      if (bulkBatches.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">${mccIcon('calendar', 40)}</div>
            <p>No bulk service batches yet.</p>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Schedule maintenance for multiple vehicles at once.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = bulkBatches.map(batch => {
        const statusClass = (batch.status || 'draft').replace(/ /g, '_');
        const vehicleCount = batch.vehicles?.length || 0;
        
        return `
          <div class="batch-card">
            <div class="batch-header">
              <div>
                <div class="batch-title">${batch.name || 'Untitled Batch'}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${batch.service_type || 'Maintenance'}</div>
              </div>
              <span class="batch-status-badge ${statusClass}">${formatBatchStatus(batch.status)}</span>
            </div>
            <div class="batch-meta">
              <span>${mccIcon('car', 16)} ${vehicleCount} vehicle${vehicleCount !== 1 ? 's' : ''}</span>
              <span>${mccIcon('calendar', 16)} ${formatDateRange(batch.start_date, batch.end_date)}</span>
              ${batch.total_estimated_cost ? `<span>${mccIcon('dollar-sign', 16)} ~$${Number(batch.total_estimated_cost).toLocaleString()}</span>` : ''}
            </div>
            <div class="batch-actions">
              ${batch.status === 'draft' ? `<button class="btn btn-secondary btn-sm" onclick="editBulkBatch('${batch.id}')">Edit</button>` : ''}
              ${batch.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="submitBulkBatch('${batch.id}')">Submit for Approval</button>` : ''}
              ${batch.status === 'pending_approval' && currentFleet.owner_id === currentUser?.id ? `<button class="btn btn-success btn-sm" onclick="approveBulkBatch('${batch.id}')">Approve</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
    
    function formatBatchStatus(status) {
      const statuses = {
        draft: 'Draft',
        pending_approval: 'Pending Approval',
        approved: 'Approved',
        in_progress: 'In Progress',
        completed: 'Completed'
      };
      return statuses[status] || status || 'Draft';
    }
    
    function formatDateRange(start, end) {
      if (!start) return 'No dates set';
      const s = new Date(start).toLocaleDateString();
      const e = end ? new Date(end).toLocaleDateString() : '';
      return e ? `${s} - ${e}` : s;
    }
    
    async function createNewFleet() {
      const name = document.getElementById('create-fleet-name').value.trim();
      const businessType = document.getElementById('create-fleet-business-type').value;
      const billingEmail = document.getElementById('create-fleet-billing-email').value.trim();
      const billingAddress = document.getElementById('create-fleet-billing-address')?.value.trim() || '';
      const taxId = document.getElementById('create-fleet-tax-id')?.value.trim() || '';
      
      if (!name) {
        showToast('Please enter a fleet name', 'error');
        return;
      }
      
      const { data, error } = await createFleet({
        name,
        business_type: businessType || 'other',
        billing_email: billingEmail || null,
        address: billingAddress || null,
        tax_id: taxId || null,
        owner_id: currentUser.id
      });
      
      if (error) {
        showToast('Failed to create fleet: ' + error.message, 'error');
        return;
      }
      
      showToast('Fleet created successfully!', 'success');
      currentFleet = data;
      await loadFleetSection();
    }
    
    function openAddFleetEmployeeModal() {
      document.getElementById('fleet-employee-email').value = '';
      document.getElementById('fleet-employee-role').value = 'driver';
      document.getElementById('fleet-employee-id').value = '';
      document.getElementById('fleet-employee-dept').value = '';
      document.getElementById('fleet-employee-spending-limit').value = '';
      document.getElementById('fleet-employee-requires-approval').checked = false;
      openModal('add-fleet-employee-modal');
    }
    
    async function addFleetEmployee() {
      const email = document.getElementById('fleet-employee-email').value.trim();
      const role = document.getElementById('fleet-employee-role').value;
      const employeeId = document.getElementById('fleet-employee-id').value.trim();
      const department = document.getElementById('fleet-employee-dept').value.trim();
      const spendingLimit = document.getElementById('fleet-employee-spending-limit').value;
      const requiresApproval = document.getElementById('fleet-employee-requires-approval').checked;
      
      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }
      
      const { data: userLookup } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
      
      const userId = userLookup?.id || null;
      
      const { error } = await addFleetMember(currentFleet.id, userId, role, {
        email,
        employee_id: employeeId || null,
        department: department || null,
        spending_limit: spendingLimit ? Number(spendingLimit) : null,
        requires_approval: requiresApproval
      });
      
      if (error) {
        showToast('Failed to add employee: ' + error.message, 'error');
        return;
      }
      
      showToast('Employee added to fleet!', 'success');
      closeModal('add-fleet-employee-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    function openEditFleetEmployee(memberId) {
      const member = fleetMembers.find(m => m.id === memberId);
      if (!member) return;
      
      editingFleetMemberId = memberId;
      const profile = member.user || {};
      const name = profile.full_name || member.email || 'Unknown';
      
      document.getElementById('edit-fleet-employee-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:48px;height:48px;background:var(--accent-gold-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">
            ${name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;font-size:1.1rem;">${name}</div>
            <div style="color:var(--text-muted);font-size:0.88rem;">${profile.email || member.email || ''}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="edit-fleet-employee-role">
            <option value="driver" ${member.role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Employee ID</label>
            <input type="text" class="form-input" id="edit-fleet-employee-id" value="${member.employee_id || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <input type="text" class="form-input" id="edit-fleet-employee-dept" value="${member.department || ''}">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Spending Limit</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:var(--text-muted);">$</span>
            <input type="number" class="form-input" id="edit-fleet-employee-spending" value="${member.spending_limit || ''}" style="max-width:150px;">
          </div>
        </div>
        
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="edit-fleet-employee-approval" ${member.requires_approval ? 'checked' : ''}>
            <span>Requires approval for all service requests</span>
          </label>
        </div>
      `;
      
      openModal('edit-fleet-employee-modal');
    }
    
    async function saveFleetEmployee() {
      if (!editingFleetMemberId) return;
      
      const role = document.getElementById('edit-fleet-employee-role').value;
      const employeeId = document.getElementById('edit-fleet-employee-id').value.trim();
      const department = document.getElementById('edit-fleet-employee-dept').value.trim();
      const spendingLimit = document.getElementById('edit-fleet-employee-spending').value;
      const requiresApproval = document.getElementById('edit-fleet-employee-approval').checked;
      
      const { error } = await updateFleetMember(editingFleetMemberId, {
        role,
        employee_id: employeeId || null,
        department: department || null,
        spending_limit: spendingLimit ? Number(spendingLimit) : null,
        requires_approval: requiresApproval
      });
      
      if (error) {
        showToast('Failed to update employee', 'error');
        return;
      }
      
      showToast('Employee updated', 'success');
      closeModal('edit-fleet-employee-modal');
      editingFleetMemberId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    async function confirmRemoveFleetEmployee(memberId, name) {
      if (!confirm(`Remove ${name} from the fleet?`)) return;
      
      const { error } = await removeFleetMember(memberId);
      if (error) {
        showToast('Failed to remove employee', 'error');
        return;
      }
      
      showToast('Employee removed from fleet', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function removeFleetEmployee() {
      if (!editingFleetMemberId) return;
      
      const member = fleetMembers.find(m => m.id === editingFleetMemberId);
      const name = member?.user?.full_name || member?.email || 'this employee';
      
      if (!confirm(`Remove ${name} from the fleet?`)) return;
      
      const { error } = await removeFleetMember(editingFleetMemberId);
      if (error) {
        showToast('Failed to remove employee', 'error');
        return;
      }
      
      showToast('Employee removed from fleet', 'success');
      closeModal('edit-fleet-employee-modal');
      editingFleetMemberId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    function openAddFleetVehicleModal() {
      const select = document.getElementById('fleet-vehicle-select');
      select.innerHTML = '<option value="">Choose a vehicle from your garage...</option>' + 
        vehicles.filter(v => !fleetVehicles.some(fv => fv.vehicle_id === v.id))
          .map(v => `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`)
          .join('');
      
      const driverSelect = document.getElementById('fleet-vehicle-driver');
      driverSelect.innerHTML = '<option value="">No assigned driver (Pool vehicle)</option>' + 
        fleetMembers.filter(m => m.role === 'driver' || m.role === 'manager')
          .map(m => `<option value="${m.user_id || m.id}">${m.user?.full_name || m.email}</option>`)
          .join('');
      
      document.getElementById('fleet-vehicle-dept').value = '';
      document.querySelectorAll('input[name="fleet-assignment-type"]').forEach(r => r.checked = r.value === 'pool');
      
      setupFleetAssignmentOptions();
      openModal('add-fleet-vehicle-modal');
    }
    
    function setupFleetAssignmentOptions() {
      document.querySelectorAll('.fleet-assignment-option').forEach(opt => {
        opt.addEventListener('click', function() {
          document.querySelectorAll('.fleet-assignment-option').forEach(o => o.style.borderColor = 'var(--border-subtle)');
          this.style.borderColor = 'var(--accent-gold)';
          
          const type = this.querySelector('input').value;
          document.getElementById('fleet-vehicle-dates-row').style.display = type === 'temporary' ? 'grid' : 'none';
        });
      });
    }
    
    async function addVehicleToFleet() {
      const vehicleId = document.getElementById('fleet-vehicle-select').value;
      const driverId = document.getElementById('fleet-vehicle-driver').value || null;
      const assignmentType = document.querySelector('input[name="fleet-assignment-type"]:checked')?.value || 'pool';
      const department = document.getElementById('fleet-vehicle-dept').value.trim();
      const startDate = document.getElementById('fleet-vehicle-start-date').value;
      const endDate = document.getElementById('fleet-vehicle-end-date').value;
      
      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }
      
      const { error } = await assignVehicleToFleet(currentFleet.id, vehicleId, {
        assigned_driver_id: driverId,
        assignment_type: assignmentType,
        department: department || null,
        start_date: startDate || null,
        end_date: endDate || null
      });
      
      if (error) {
        showToast('Failed to add vehicle to fleet: ' + error.message, 'error');
        return;
      }
      
      showToast('Vehicle added to fleet!', 'success');
      closeModal('add-fleet-vehicle-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    function openEditFleetVehicle(assignmentId) {
      const fv = fleetVehicles.find(v => v.id === assignmentId);
      if (!fv) return;
      
      editingFleetVehicleId = assignmentId;
      const v = fv.vehicle || {};
      
      const driverOptions = '<option value="">No assigned driver (Pool vehicle)</option>' + 
        fleetMembers.filter(m => m.role === 'driver' || m.role === 'manager')
          .map(m => `<option value="${m.user_id || m.id}" ${(m.user_id || m.id) === fv.assigned_driver_id ? 'selected' : ''}>${m.user?.full_name || m.email}</option>`)
          .join('');
      
      document.getElementById('edit-fleet-vehicle-content').innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
          <div style="width:80px;height:60px;background:var(--bg-input);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;">
            ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : mccIcon('car', 16)}
          </div>
          <div>
            <div style="font-weight:600;font-size:1.1rem;">${v.year} ${v.make} ${v.model}</div>
            <div style="color:var(--text-muted);font-size:0.88rem;">VIN: ${v.vin || 'N/A'}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Assigned Driver</label>
          <select class="form-select" id="edit-fleet-vehicle-driver">${driverOptions}</select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Assignment Type</label>
          <select class="form-select" id="edit-fleet-vehicle-type">
            <option value="permanent" ${fv.assignment_type === 'permanent' ? 'selected' : ''}>Permanent</option>
            <option value="temporary" ${fv.assignment_type === 'temporary' ? 'selected' : ''}>Temporary</option>
            <option value="pool" ${fv.assignment_type === 'pool' ? 'selected' : ''}>Pool</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Department / Cost Center</label>
          <input type="text" class="form-input" id="edit-fleet-vehicle-dept" value="${fv.department || ''}">
        </div>
      `;
      
      openModal('edit-fleet-vehicle-modal');
    }
    
    async function saveFleetVehicle() {
      if (!editingFleetVehicleId) return;
      
      const driverId = document.getElementById('edit-fleet-vehicle-driver').value || null;
      const assignmentType = document.getElementById('edit-fleet-vehicle-type').value;
      const department = document.getElementById('edit-fleet-vehicle-dept').value.trim();
      
      const { error } = await updateFleetVehicleAssignment(editingFleetVehicleId, {
        assigned_driver_id: driverId,
        assignment_type: assignmentType,
        department: department || null
      });
      
      if (error) {
        showToast('Failed to update vehicle assignment', 'error');
        return;
      }
      
      showToast('Vehicle assignment updated', 'success');
      closeModal('edit-fleet-vehicle-modal');
      editingFleetVehicleId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    async function removeVehicleFromFleet() {
      if (!editingFleetVehicleId) return;
      
      const fv = fleetVehicles.find(v => v.id === editingFleetVehicleId);
      const vehicleName = fv?.vehicle ? `${fv.vehicle.year} ${fv.vehicle.make} ${fv.vehicle.model}` : 'this vehicle';
      
      if (!confirm(`Remove ${vehicleName} from the fleet?`)) return;
      
      const { error } = await supabaseClient
        .from('fleet_vehicles')
        .delete()
        .eq('id', editingFleetVehicleId);
      
      if (error) {
        showToast('Failed to remove vehicle', 'error');
        return;
      }
      
      showToast('Vehicle removed from fleet', 'success');
      closeModal('edit-fleet-vehicle-modal');
      editingFleetVehicleId = null;
      await loadFleetDetails(currentFleet.id);
    }
    
    function openBulkServiceWizard() {
      bulkWizardStep = 1;
      bulkSelectedVehicles = [];
      
      document.getElementById('bulk-batch-title').value = '';
      document.getElementById('bulk-service-type').value = '';
      document.getElementById('bulk-batch-description').value = '';
      document.getElementById('bulk-date-start').value = '';
      document.getElementById('bulk-date-end').value = '';
      
      updateBulkWizardUI();
      openModal('bulk-service-wizard-modal');
    }
    
    function updateBulkWizardUI() {
      document.querySelectorAll('.wizard-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i + 1 < bulkWizardStep) step.classList.add('completed');
        if (i + 1 === bulkWizardStep) step.classList.add('active');
      });
      
      document.querySelectorAll('.bulk-wizard-step').forEach((step, i) => {
        step.style.display = i + 1 === bulkWizardStep ? 'block' : 'none';
      });
      
      document.getElementById('bulk-prev-btn').style.display = bulkWizardStep > 1 ? 'inline-flex' : 'none';
      document.getElementById('bulk-next-btn').style.display = bulkWizardStep < 4 ? 'inline-flex' : 'none';
      document.getElementById('bulk-submit-btn').style.display = bulkWizardStep === 4 ? 'inline-flex' : 'none';
    }
    
    function bulkWizardNext() {
      if (bulkWizardStep === 1) {
        const title = document.getElementById('bulk-batch-title').value.trim();
        const serviceType = document.getElementById('bulk-service-type').value;
        const startDate = document.getElementById('bulk-date-start').value;
        const endDate = document.getElementById('bulk-date-end').value;
        
        if (!title || !serviceType || !startDate || !endDate) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        renderBulkVehiclesList();
      } else if (bulkWizardStep === 2) {
        if (bulkSelectedVehicles.length === 0) {
          showToast('Please select at least one vehicle', 'error');
          return;
        }
        renderBulkScheduleList();
      } else if (bulkWizardStep === 3) {
        renderBulkReview();
      }
      
      bulkWizardStep++;
      updateBulkWizardUI();
    }
    
    function bulkWizardPrev() {
      if (bulkWizardStep > 1) {
        bulkWizardStep--;
        updateBulkWizardUI();
      }
    }
    
    function renderBulkVehiclesList() {
      const container = document.getElementById('bulk-vehicles-list');
      
      container.innerHTML = fleetVehicles.map(fv => {
        const v = fv.vehicle || {};
        const isSelected = bulkSelectedVehicles.includes(fv.id);
        
        return `
          <label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border:2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-md);cursor:pointer;transition:all 0.15s;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBulkVehicle('${fv.id}')">
            <div style="width:50px;height:40px;background:var(--bg-elevated);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : mccIcon('car', 16)}
            </div>
            <div style="flex:1;">
              <div style="font-weight:500;">${v.year} ${v.make} ${v.model}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">${fv.department || 'No department'}</div>
            </div>
          </label>
        `;
      }).join('');
      
      updateBulkSelectedCount();
    }
    
    function toggleBulkVehicle(vehicleId) {
      if (bulkSelectedVehicles.includes(vehicleId)) {
        bulkSelectedVehicles = bulkSelectedVehicles.filter(id => id !== vehicleId);
      } else {
        bulkSelectedVehicles.push(vehicleId);
      }
      renderBulkVehiclesList();
    }
    
    function toggleAllBulkVehicles() {
      if (bulkSelectedVehicles.length === fleetVehicles.length) {
        bulkSelectedVehicles = [];
      } else {
        bulkSelectedVehicles = fleetVehicles.map(fv => fv.id);
      }
      renderBulkVehiclesList();
    }
    
    function updateBulkSelectedCount() {
      document.getElementById('bulk-selected-count').textContent = bulkSelectedVehicles.length;
    }
    
    function renderBulkScheduleList() {
      const container = document.getElementById('bulk-schedule-list');
      const startDate = document.getElementById('bulk-date-start').value;
      
      container.innerHTML = bulkSelectedVehicles.map(fvId => {
        const fv = fleetVehicles.find(v => v.id === fvId);
        if (!fv) return '';
        const v = fv.vehicle || {};
        
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="flex:1;">
              <div style="font-weight:500;">${v.year} ${v.make} ${v.model}</div>
            </div>
            <input type="date" class="form-input" style="width:auto;" id="bulk-schedule-${fvId}" value="${startDate}">
          </div>
        `;
      }).join('');
    }
    
    function renderBulkReview() {
      const title = document.getElementById('bulk-batch-title').value;
      const serviceType = document.getElementById('bulk-service-type').value;
      const description = document.getElementById('bulk-batch-description').value;
      const startDate = document.getElementById('bulk-date-start').value;
      const endDate = document.getElementById('bulk-date-end').value;
      
      const vehiclesList = bulkSelectedVehicles.map(fvId => {
        const fv = fleetVehicles.find(v => v.id === fvId);
        if (!fv) return '';
        const v = fv.vehicle || {};
        const schedDate = document.getElementById(`bulk-schedule-${fvId}`)?.value || startDate;
        
        return `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
            <span>${v.year} ${v.make} ${v.model}</span>
            <span style="color:var(--text-muted);">${new Date(schedDate).toLocaleDateString()}</span>
          </div>
        `;
      }).join('');
      
      document.getElementById('bulk-review-content').innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <h4 style="margin-bottom:12px;">${mccIcon('clipboard-list', 16)} Batch Details</h4>
          <div style="display:grid;gap:8px;font-size:0.9rem;">
            <div><strong>Title:</strong> ${title}</div>
            <div><strong>Service Type:</strong> ${serviceType}</div>
            <div><strong>Date Range:</strong> ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</div>
            ${description ? `<div><strong>Description:</strong> ${description}</div>` : ''}
          </div>
        </div>
        
        <div class="card">
          <h4 style="margin-bottom:12px;">${mccIcon('car', 16)} Vehicles (${bulkSelectedVehicles.length})</h4>
          ${vehiclesList}
        </div>
        
        <div style="margin-top:16px;padding:16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
          <strong style="color:var(--accent-gold);">${mccIcon('info', 16)} What happens next:</strong>
          <p style="font-size:0.88rem;color:var(--text-secondary);margin-top:8px;">
            This batch will be submitted for approval. Once approved, individual maintenance packages will be created for each vehicle and sent out for provider bids.
          </p>
        </div>
      `;
    }
    
    async function submitBulkServiceBatch() {
      const title = document.getElementById('bulk-batch-title').value.trim();
      const serviceType = document.getElementById('bulk-service-type').value;
      const description = document.getElementById('bulk-batch-description').value.trim();
      const startDate = document.getElementById('bulk-date-start').value;
      const endDate = document.getElementById('bulk-date-end').value;
      
      const vehicleSchedules = bulkSelectedVehicles.map(fvId => {
        const schedDate = document.getElementById(`bulk-schedule-${fvId}`)?.value || startDate;
        return { fleet_vehicle_id: fvId, scheduled_date: schedDate };
      });
      
      const { data, error } = await createBulkServiceBatch(currentFleet.id, {
        name: title,
        service_type: serviceType,
        description: description || null,
        start_date: startDate,
        end_date: endDate,
        vehicles: vehicleSchedules,
        status: 'pending_approval'
      });
      
      if (error) {
        showToast('Failed to create bulk service batch: ' + error.message, 'error');
        return;
      }
      
      showToast('Bulk service batch submitted for approval!', 'success');
      closeModal('bulk-service-wizard-modal');
      await loadBulkBatches();
    }
    
    async function approveBulkBatch(batchId) {
      if (!confirm('Approve this bulk service batch? This will create maintenance packages for all vehicles.')) return;
      
      const { error } = await approveBulkServiceBatch(batchId);
      if (error) {
        showToast('Failed to approve batch: ' + error.message, 'error');
        return;
      }
      
      showToast('Batch approved! Maintenance packages are being created.', 'success');
      await loadBulkBatches();
    }
    
    function openFleetSettingsModal() {
      if (!currentFleet) return;
      
      document.getElementById('fleet-settings-name').value = currentFleet.name || '';
      document.getElementById('fleet-settings-company-name').value = currentFleet.company_name || '';
      document.getElementById('fleet-settings-business-type').value = currentFleet.business_type || 'other';
      document.getElementById('fleet-settings-billing-email').value = currentFleet.billing_email || '';
      document.getElementById('fleet-settings-address').value = currentFleet.address || '';
      const taxIdEl = document.getElementById('fleet-settings-tax-id');
      if (taxIdEl) taxIdEl.value = currentFleet.tax_id || '';
      
      openModal('fleet-settings-modal');
    }
    
    async function saveFleetSettings() {
      const name = document.getElementById('fleet-settings-name').value.trim();
      const companyName = document.getElementById('fleet-settings-company-name').value.trim();
      const businessType = document.getElementById('fleet-settings-business-type').value;
      const billingEmail = document.getElementById('fleet-settings-billing-email').value.trim();
      const address = document.getElementById('fleet-settings-address').value.trim();
      const taxId = document.getElementById('fleet-settings-tax-id')?.value.trim() || '';
      
      if (!name) {
        showToast('Please enter a fleet name', 'error');
        return;
      }
      
      const { error } = await supabaseClient
        .from('fleets')
        .update({
          name,
          company_name: companyName || null,
          business_type: businessType,
          billing_email: billingEmail || null,
          address: address || null,
          tax_id: taxId || null
        })
        .eq('id', currentFleet.id);
      
      if (error) {
        showToast('Failed to update fleet settings', 'error');
        return;
      }
      
      showToast('Fleet settings updated', 'success');
      closeModal('fleet-settings-modal');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function suspendFleetMember(memberId, memberName) {
      if (!confirm(`Suspend ${memberName}? They will not be able to request services.`)) return;
      
      const { error } = await updateFleetMember(memberId, { status: 'suspended' });
      if (error) {
        showToast('Failed to suspend member', 'error');
        return;
      }
      
      showToast('Member suspended', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    async function activateFleetMember(memberId, memberName) {
      const { error } = await updateFleetMember(memberId, { status: 'active' });
      if (error) {
        showToast('Failed to activate member', 'error');
        return;
      }
      
      showToast('Member activated', 'success');
      await loadFleetDetails(currentFleet.id);
    }
    
    function editFleetName() {
      const newName = prompt('Enter new fleet name:', currentFleet?.name || '');
      if (!newName || newName.trim() === currentFleet?.name) return;
      
      supabaseClient
        .from('fleets')
        .update({ name: newName.trim() })
        .eq('id', currentFleet.id)
        .then(({ error }) => {
          if (error) {
            showToast('Failed to update fleet name', 'error');
            return;
          }
          showToast('Fleet name updated', 'success');
          loadFleetDetails(currentFleet.id);
        });
    }


    // ========== SPENDING ANALYTICS ==========
    let spendingChart = null;
    let spendingData = { parts: [], labor: [], taxes: [], towing: [], platform: [], other: [] };

    function initSpendingAnalytics() {
      const yearFilter = document.getElementById('spending-year-filter');
      const currentYear = new Date().getFullYear();
      yearFilter.innerHTML = '';
      for (let y = currentYear; y >= currentYear - 5; y--) {
        yearFilter.innerHTML += `<option value="${y}">${y}</option>`;
      }
      yearFilter.value = currentYear;
      yearFilter.addEventListener('change', () => loadSpendingData());
      
      const vehicleFilter = document.getElementById('spending-vehicle-filter');
      vehicleFilter.innerHTML = '<option value="">All Vehicles</option>';
      if (window.userVehicles && userVehicles.length > 0) {
        userVehicles.forEach(v => {
          vehicleFilter.innerHTML += `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`;
        });
      }
      vehicleFilter.addEventListener('change', () => loadSpendingData());
      
      loadSpendingData();
    }

    async function loadSpendingData() {
      const year = document.getElementById('spending-year-filter').value || new Date().getFullYear();
      const vehicleId = document.getElementById('spending-vehicle-filter').value;
      
      document.getElementById('spending-year-label').textContent = year;
      
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      let query = supabaseClient
        .from('payments')
        .select('*, packages(vehicle_id, transfer_type, vehicles(year, make, model, fuel_injection_type)), bids(parts_cost, labor_cost, tax_amount, towing_cost)')
        .eq('member_id', currentUser.id)
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .lte('created_at', endDate);
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading spending data:', error);
        return;
      }
      
      const monthlyData = Array(12).fill(null).map(() => ({ parts: 0, labor: 0, taxes: 0, towing: 0, platform: 0, other: 0 }));
      let totalParts = 0, totalLabor = 0, totalTaxes = 0, totalTowing = 0, totalPlatform = 0, totalOther = 0;
      
      (data || []).forEach(payment => {
        if (vehicleId && payment.packages?.vehicle_id !== vehicleId) return;
        
        const month = new Date(payment.created_at).getMonth();
        const total = Number.parseFloat(payment.amount) || 0;
        const bid = payment.bids || {};
        const pkg = payment.packages || {};
        
        const platformFee = total * 0.075;
        const parts = Number.parseFloat(bid.parts_cost) || 0;
        const labor = Number.parseFloat(bid.labor_cost) || 0;
        const taxes = Number.parseFloat(bid.tax_amount) || (total * 0.08);
        const isTowing = pkg.transfer_type === 'towing' || Number.parseFloat(bid.towing_cost) > 0;
        const towing = Number.parseFloat(bid.towing_cost) || (isTowing ? total * 0.15 : 0);
        
        let calculatedTotal = parts + labor + taxes + towing + platformFee;
        let other = 0;
        if (parts === 0 && labor === 0) {
          const remaining = total - platformFee - taxes - towing;
          const partsEst = remaining * 0.45;
          const laborEst = remaining * 0.45;
          other = remaining * 0.1;
          monthlyData[month].parts += partsEst;
          monthlyData[month].labor += laborEst;
          totalParts += partsEst;
          totalLabor += laborEst;
        } else {
          other = Math.max(0, total - calculatedTotal);
          monthlyData[month].parts += parts;
          monthlyData[month].labor += labor;
          totalParts += parts;
          totalLabor += labor;
        }
        
        monthlyData[month].taxes += taxes;
        monthlyData[month].towing += towing;
        monthlyData[month].platform += platformFee;
        monthlyData[month].other += other;
        
        totalTaxes += taxes;
        totalTowing += towing;
        totalPlatform += platformFee;
        totalOther += other;
      });
      
      spendingData = {
        parts: monthlyData.map(m => m.parts),
        labor: monthlyData.map(m => m.labor),
        taxes: monthlyData.map(m => m.taxes),
        towing: monthlyData.map(m => m.towing),
        platform: monthlyData.map(m => m.platform),
        other: monthlyData.map(m => m.other)
      };
      
      const grandTotal = totalParts + totalLabor + totalTaxes + totalTowing + totalPlatform + totalOther;
      document.getElementById('spending-total-label').textContent = '$' + grandTotal.toFixed(2);
      document.getElementById('legend-parts').textContent = '$' + totalParts.toFixed(2);
      document.getElementById('legend-labor').textContent = '$' + totalLabor.toFixed(2);
      document.getElementById('legend-taxes').textContent = '$' + totalTaxes.toFixed(2);
      document.getElementById('legend-towing').textContent = '$' + totalTowing.toFixed(2);
      document.getElementById('legend-platform').textContent = '$' + totalPlatform.toFixed(2);
      document.getElementById('legend-other').textContent = '$' + totalOther.toFixed(2);
      
      renderSpendingChart();
    }

    function renderSpendingChart() {
      const ctx = document.getElementById('spending-chart');
      if (!ctx) return;
      
      if (spendingChart) spendingChart.destroy();
      
      spendingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [
            { label: 'Parts', data: spendingData.parts, backgroundColor: '#4a7cff', borderRadius: 4 },
            { label: 'Labor', data: spendingData.labor, backgroundColor: '#9b59b6', borderRadius: 4 },
            { label: 'Taxes', data: spendingData.taxes, backgroundColor: '#e74c3c', borderRadius: 4 },
            { label: 'Towing', data: spendingData.towing, backgroundColor: '#3498db', borderRadius: 4 },
            { label: 'Platform Fee', data: spendingData.platform, backgroundColor: '#4ac88c', borderRadius: 4 },
            { label: 'Other', data: spendingData.other, backgroundColor: '#f59e0b', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8' } },
            y: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8', callback: v => '$' + v } }
          }
        }
      });
    }

    function downloadSpendingCSV() {
      const year = document.getElementById('spending-year-filter').value;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let csv = 'Month,Parts,Labor,Taxes,Towing,Platform Fee,Other,Total\n';
      
      for (let i = 0; i < 12; i++) {
        const parts = spendingData.parts[i] || 0;
        const labor = spendingData.labor[i] || 0;
        const taxes = spendingData.taxes[i] || 0;
        const towing = spendingData.towing[i] || 0;
        const platform = spendingData.platform[i] || 0;
        const other = spendingData.other[i] || 0;
        const total = parts + labor + taxes + towing + platform + other;
        csv += `${months[i]},${parts.toFixed(2)},${labor.toFixed(2)},${taxes.toFixed(2)},${towing.toFixed(2)},${platform.toFixed(2)},${other.toFixed(2)},${total.toFixed(2)}\n`;
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spending-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    let vaCurrentStep = 1;
    let vaSessionType = 'diagnostic';
    let vaSelectedVehicle = null;
    let vaMediaFiles = [];
    let vaMediaUrls = [];
    let vaAssessmentResult = null;

    function openVehicleAssistantModal() {
      vaCurrentStep = 1;
      vaSessionType = 'diagnostic';
      vaSelectedVehicle = null;
      vaMediaFiles = [];
      vaMediaUrls = [];
      vaAssessmentResult = null;
      
      const vehicleSelect = document.getElementById('va-vehicle-select');
      vehicleSelect.innerHTML = '<option value="">Choose a vehicle from your garage...</option>';
      vehicles.forEach(v => {
        vehicleSelect.innerHTML += `<option value="${v.id}">${v.year} ${v.make} ${v.model}</option>`;
      });
      
      document.querySelectorAll('.va-type-card').forEach(c => c.classList.remove('selected'));
      document.querySelector('.va-type-card[data-type="diagnostic"]').classList.add('selected');
      document.getElementById('va-description').value = '';
      document.querySelectorAll('#va-symptoms-section input[type="checkbox"]').forEach(cb => cb.checked = false);
      document.getElementById('va-media-preview').innerHTML = '';
      document.getElementById('va-upload-status').textContent = '';
      document.getElementById('va-loading').style.display = 'block';
      document.getElementById('va-result').style.display = 'none';
      
      updateVaUI();
      document.getElementById('vehicle-assistant-modal').classList.add('active');
    }

    function selectVaType(type) {
      vaSessionType = type;
      document.querySelectorAll('.va-type-card').forEach(c => c.classList.remove('selected'));
      document.querySelector(`.va-type-card[data-type="${type}"]`).classList.add('selected');
    }

    function updateVaUI() {
      for (let i = 1; i <= 4; i++) {
        document.getElementById(`va-step-${i}`).style.display = i === vaCurrentStep ? 'block' : 'none';
      }
      
      document.querySelectorAll('.va-step').forEach(step => {
        const stepNum = Number.parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (stepNum === vaCurrentStep) step.classList.add('active');
        else if (stepNum < vaCurrentStep) step.classList.add('completed');
      });
      
      const backBtn = document.getElementById('va-back-btn');
      const nextBtn = document.getElementById('va-next-btn');
      const footer = document.getElementById('va-footer');
      
      backBtn.style.display = vaCurrentStep > 1 ? 'block' : 'none';
      
      if (vaCurrentStep === 4) {
        footer.style.display = 'none';
      } else {
        footer.style.display = 'flex';
        nextBtn.textContent = vaCurrentStep === 3 ? 'Get Assessment →' : 'Next →';
      }
      
      if (vaSessionType === 'diagnostic') {
        document.getElementById('va-description-label').textContent = 'Describe the Issue';
        document.getElementById('va-description').placeholder = 'Be as detailed as possible. What do you see, hear, or feel? When did it start?';
        document.getElementById('va-symptoms-section').style.display = 'block';
      } else {
        document.getElementById('va-description-label').textContent = 'Describe the Custom Work';
        document.getElementById('va-description').placeholder = 'Describe the modifications or cosmetic work you want done. Include any specific requirements or preferences.';
        document.getElementById('va-symptoms-section').style.display = 'none';
      }
    }

    function vaGoBack() {
      if (vaCurrentStep > 1) {
        vaCurrentStep--;
        updateVaUI();
      }
    }

    async function vaGoNext() {
      if (vaCurrentStep === 1) {
        const vehicleId = document.getElementById('va-vehicle-select').value;
        if (!vehicleId) {
          showToast('Please select a vehicle', 'error');
          return;
        }
        vaSelectedVehicle = vehicles.find(v => v.id === vehicleId);
        vaCurrentStep = 2;
        updateVaUI();
      } else if (vaCurrentStep === 2) {
        const description = document.getElementById('va-description').value.trim();
        if (description.length < 10) {
          showToast('Please provide a more detailed description (at least 10 characters)', 'error');
          return;
        }
        vaCurrentStep = 3;
        updateVaUI();
      } else if (vaCurrentStep === 3) {
        vaCurrentStep = 4;
        updateVaUI();
        await generateVaAssessment();
      }
    }

    async function handleVaMediaSelect(event) {
      const files = Array.from(event.target.files);
      const maxFiles = 5;
      const maxSize = 10 * 1024 * 1024;
      
      if (vaMediaFiles.length + files.length > maxFiles) {
        showToast(`Maximum ${maxFiles} files allowed`, 'error');
        return;
      }
      
      for (const file of files) {
        if (file.size > maxSize) {
          showToast(`${file.name} exceeds 10MB limit`, 'error');
          continue;
        }
        vaMediaFiles.push(file);
      }
      
      renderVaMediaPreviews();
      event.target.value = '';
    }

    function renderVaMediaPreviews() {
      const container = document.getElementById('va-media-preview');
      container.innerHTML = '';
      
      vaMediaFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'va-media-item';
        
        if (file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(file);
          div.appendChild(img);
        } else if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(file);
          video.muted = true;
          div.appendChild(video);
        } else if (file.type.startsWith('audio/')) {
          div.innerHTML = '<div class="va-audio-icon">' + mccIcon('sparkles', 16) + '</div>';
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'va-media-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeVaMedia(index);
        div.appendChild(removeBtn);
        
        container.appendChild(div);
      });
    }

    function removeVaMedia(index) {
      vaMediaFiles.splice(index, 1);
      renderVaMediaPreviews();
    }

    async function uploadVaMedia() {
      if (vaMediaFiles.length === 0) return [];
      
      const statusEl = document.getElementById('va-upload-status');
      const urls = [];
      
      for (let i = 0; i < vaMediaFiles.length; i++) {
        const file = vaMediaFiles[i];
        statusEl.textContent = `Uploading ${i + 1}/${vaMediaFiles.length}...`;
        
        try {
          const ext = file.name.split('.').pop().toLowerCase();
          const filename = `${crypto.randomUUID()}.${ext}`;
          const path = `diagnostic-media/${currentUser.id}/${filename}`;
          
          const { data, error } = await supabaseClient.storage
            .from('vehicle-files')
            .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
          
          if (error) {
            console.error('Upload error:', error);
            continue;
          }
          
          const { data: publicData } = supabaseClient.storage.from('vehicle-files').getPublicUrl(path);
          if (publicData?.publicUrl) {
            urls.push(publicData.publicUrl);
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
      }
      
      statusEl.textContent = `Uploaded ${urls.length} file(s)`;
      return urls;
    }

    async function generateVaAssessment() {
      document.getElementById('va-loading').style.display = 'block';
      document.getElementById('va-result').style.display = 'none';
      document.getElementById('va-footer').style.display = 'none';
      
      try {
        vaMediaUrls = await uploadVaMedia();
        
        const symptoms = [];
        document.querySelectorAll('#va-symptoms-section input[type="checkbox"]:checked').forEach(cb => {
          symptoms.push(cb.value);
        });
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/diagnostics/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionType: vaSessionType,
            vehicleInfo: vaSelectedVehicle ? {
              year: vaSelectedVehicle.year,
              make: vaSelectedVehicle.make,
              model: vaSelectedVehicle.model,
              mileage: vaSelectedVehicle.mileage
            } : null,
            description: document.getElementById('va-description').value.trim(),
            symptoms: symptoms,
            mediaUrls: vaMediaUrls
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to generate assessment');
        }
        
        vaAssessmentResult = await response.json();
        displayVaResult(vaAssessmentResult);
        
      } catch (error) {
        console.error('Assessment error:', error);
        showToast('Failed to generate assessment. Please try again.', 'error');
        vaCurrentStep = 3;
        updateVaUI();
      }
    }

    function displayVaResult(result) {
      document.getElementById('va-loading').style.display = 'none';
      document.getElementById('va-result').style.display = 'block';
      
      const severityLabels = {
        low: mccIcon('check-circle', 16) + ' Low Priority',
        medium: mccIcon('alert-triangle', 16) + ' Medium Priority',
        high: mccIcon('alert-triangle', 16) + ' High Priority',
        critical: mccIcon('circle-alert', 16) + ' Critical - Address Immediately',
        cosmetic: mccIcon('sparkles', 16) + ' Cosmetic Work'
      };
      
      const severityBadge = document.getElementById('va-severity-badge');
      severityBadge.innerHTML = `<span class="va-severity ${result.severity || 'medium'}">${severityLabels[result.severity] || severityLabels.medium}</span>`;
      
      document.getElementById('va-assessment-text').textContent = result.assessment || 'No assessment available.';
      
      const costs = result.costEstimate || {};
      const partsLow = costs.partsLow || 0;
      const partsHigh = costs.partsHigh || 0;
      const laborLow = costs.laborLow || 0;
      const laborHigh = costs.laborHigh || 0;
      
      document.getElementById('va-parts-cost').textContent = `$${partsLow.toLocaleString()} - $${partsHigh.toLocaleString()}`;
      document.getElementById('va-labor-cost').textContent = `$${laborLow.toLocaleString()} - $${laborHigh.toLocaleString()}`;
      
      const totalLow = partsLow + laborLow;
      const totalHigh = partsHigh + laborHigh;
      document.getElementById('va-total-cost').textContent = `$${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()}`;
      
      const warningsSection = document.getElementById('va-safety-warnings');
      const warningsList = document.getElementById('va-warnings-list');
      if (result.safetyWarnings && result.safetyWarnings.length > 0) {
        warningsSection.style.display = 'block';
        warningsList.innerHTML = result.safetyWarnings.map(w => `<li>${w}</li>`).join('');
      } else {
        warningsSection.style.display = 'none';
      }
      
      const servicesList = document.getElementById('va-services-list');
      const services = result.recommendedServices || result.recommendedCategories || [];
      if (services.length > 0) {
        servicesList.innerHTML = services.map(s => `<span class="va-service-tag">${s}</span>`).join('');
      } else {
        servicesList.innerHTML = '<span class="va-service-tag">General Maintenance</span>';
      }
      
      document.getElementById('va-disclaimer-text').textContent = result.disclaimer || 'This is an AI-powered informational tool only. Always consult a professional mechanic.';
    }

    function createServiceRequestFromAssessment() {
      if (!vaAssessmentResult || !vaSelectedVehicle) {
        showToast('No assessment available', 'error');
        return;
      }
      
      closeModal('vehicle-assistant-modal');
      
      openPackageModal();
      
      setTimeout(() => {
        const vehicleSelect = document.getElementById('p-vehicle');
        if (vehicleSelect) {
          vehicleSelect.value = vaSelectedVehicle.id;
        }
        
        const categorySelect = document.getElementById('p-category');
        if (categorySelect) {
          const categories = vaAssessmentResult.recommendedCategories || [];
          if (categories.includes('maintenance') || categories.includes('mechanical')) {
            categorySelect.value = 'maintenance';
          } else if (categories.includes('cosmetic') || categories.includes('body')) {
            categorySelect.value = 'cosmetic';
          } else if (categories.includes('performance')) {
            categorySelect.value = 'performance';
          }
        }
        
        const titleInput = document.getElementById('p-title');
        if (titleInput) {
          const services = vaAssessmentResult.recommendedServices || [];
          titleInput.value = services.length > 0 ? services.slice(0, 2).join(' & ') : (vaSessionType === 'diagnostic' ? 'Vehicle Issue - AI Assessed' : 'Custom Work Request');
        }
        
        const descriptionInput = document.getElementById('p-description');
        if (descriptionInput) {
          const originalDesc = document.getElementById('va-description').value.trim();
          const costs = vaAssessmentResult.costEstimate || {};
          const totalLow = (costs.partsLow || 0) + (costs.laborLow || 0);
          const totalHigh = (costs.partsHigh || 0) + (costs.laborHigh || 0);
          
          descriptionInput.value = `${originalDesc}

--- AI Assessment Summary ---
${vaAssessmentResult.assessment}

Estimated Cost Range: $${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()}
Severity: ${vaAssessmentResult.severity || 'Not specified'}

Note: This assessment was generated by AI and is for informational purposes only. Actual diagnosis and costs may vary.`;
        }
        
        showToast('Assessment loaded into service request form', 'success');
      }, 300);
    }

    // Car Education Data
    const carEducation = {
      maintenance101: [
        { title: 'Why Oil Changes Matter', content: '<p>Oil is the lifeblood of your engine. It lubricates hundreds of moving parts, reduces friction, carries away heat, and prevents harmful deposits from building up inside. Without clean oil, metal components grind against each other, generating excessive heat and accelerating wear.</p><h4>What Happens When You Skip Oil Changes</h4><p>Over time, oil breaks down and becomes contaminated with dirt, metal shavings, and combustion byproducts. When this happens, it loses its ability to protect your engine. The result can be <strong>sludge buildup</strong>, overheating, and eventually catastrophic engine failure. An engine replacement can cost <strong>$3,000 to $7,000 or more</strong>, while a routine oil change typically runs just <strong>$30 to $75</strong>.</p><h4>How Often Should You Change Your Oil?</h4><ul><li><strong>Conventional oil:</strong> Every 3,000-5,000 miles</li><li><strong>Synthetic blend:</strong> Every 5,000-7,500 miles</li><li><strong>Full synthetic:</strong> Every 7,500-10,000 miles</li></ul><p>Always check your owner\\\'s manual for the manufacturer\\\'s recommendation. Driving conditions matter too - frequent short trips, dusty roads, extreme temperatures, and stop-and-go traffic all call for more frequent changes.</p><p>My Car Concierge can help you track your oil change schedule and get competitive bids from verified providers when it\\\'s time for service, so you never overpay or miss an interval.</p>', icon: mccIcon('fuel', 16), readTime: '4 min' },
        { title: 'Brake Basics', content: '<p>Your braking system is arguably the most important safety feature on your vehicle. Understanding how it works helps you recognize problems early and make informed decisions about repairs.</p><h4>How Your Brakes Work</h4><p>When you press the brake pedal, hydraulic fluid transmits that force to <strong>brake calipers</strong> at each wheel. The calipers squeeze <strong>brake pads</strong> against spinning <strong>rotors</strong> (metal discs), creating friction that slows your car. This friction generates intense heat, which is why brake components wear down over time.</p><h4>When to Replace Brake Components</h4><ul><li><strong>Brake pads:</strong> Every 30,000-70,000 miles depending on driving habits</li><li><strong>Rotors:</strong> Every 50,000-70,000 miles, or when they become too thin or warped</li><li><strong>Brake fluid:</strong> Every 2-3 years or 30,000 miles</li></ul><p>A high-pitched <strong>squealing sound</strong> when braking usually means your pads have built-in wear indicators telling you it\\\'s time for replacement. If you hear <strong>grinding</strong> (metal on metal), the pads are completely worn and you\\\'re damaging the rotors - this turns a <strong>$150-$300 pad replacement</strong> into a <strong>$400-$800 pad and rotor job</strong>.</p><p>Don\\\'t wait until brakes become a safety hazard. Through My Car Concierge, you can request brake service and receive competitive bids from multiple verified providers, ensuring you get quality work at a fair price.</p>', icon: mccIcon('circle-alert', 16), readTime: '4 min' },
        { title: 'Tire Care Essentials', content: '<p>Your tires are the only part of your car that actually touches the road, making them critical for safety, fuel efficiency, and ride comfort. Proper tire care is one of the simplest and most impactful maintenance tasks you can perform.</p><h4>Tire Rotation</h4><p>Tires wear unevenly because front and rear tires handle different loads and forces. <strong>Rotate your tires every 5,000-7,500 miles</strong> to promote even wear and extend their lifespan. Most tire shops include free rotations when you purchase tires from them.</p><h4>Tire Pressure</h4><p>Check your tire pressure <strong>at least once a month</strong> and before long trips. The correct pressure is listed on a sticker inside your driver\\\'s door jamb (not the number on the tire sidewall). Underinflated tires increase fuel consumption by up to <strong>3%</strong>, wear out faster on the edges, and can overheat at highway speeds. Overinflated tires wear faster in the center and provide a harsher ride.</p><h4>When to Replace Tires</h4><ul><li>Tread depth below <strong>2/32 of an inch</strong> (use the penny test - if you can see all of Lincoln\\\'s head, it\\\'s time)</li><li>Visible cracks, bulges, or blisters on the sidewall</li><li>Tires older than <strong>6 years</strong> regardless of tread depth</li><li>Uneven wear patterns that don\\\'t correct with rotation</li></ul><p>A set of quality tires typically costs <strong>$400-$800</strong> for a standard sedan. Through My Car Concierge, you can get quotes from multiple tire shops to find the best deal on the right tires for your vehicle and driving needs.</p>', icon: mccIcon('refresh-cw', 16), readTime: '4 min' },
        { title: 'Battery Health', content: '<p>Your car\\\'s battery provides the electrical energy needed to start the engine and power accessories when the engine is off. A dead battery is one of the most common reasons for roadside assistance calls, but with basic awareness, you can avoid being stranded.</p><h4>Battery Lifespan</h4><p>Most car batteries last <strong>3 to 5 years</strong>, though this varies significantly based on climate, driving habits, and vehicle type. <strong>Extreme heat</strong> actually damages batteries more than cold - it accelerates chemical degradation inside the battery. Cold weather just reveals the weakness by demanding more power to start a cold engine.</p><h4>Warning Signs of a Failing Battery</h4><ul><li><strong>Slow engine crank:</strong> The engine turns over sluggishly when starting</li><li><strong>Dim headlights:</strong> Noticeably dimmer than usual, especially at idle</li><li><strong>Dashboard warning light:</strong> Battery or charging system indicator illuminated</li><li><strong>Electrical issues:</strong> Power windows moving slowly, radio resetting</li><li><strong>Swollen battery case:</strong> Indicates internal damage from heat</li></ul><h4>Extending Battery Life</h4><p>Avoid frequent short trips that don\\\'t give the alternator time to fully recharge the battery. Keep battery terminals clean and free of corrosion (white or greenish buildup). If you park your car for extended periods, consider a <strong>battery maintainer</strong> ($25-$50) to keep it charged.</p><p>Replacement batteries typically cost <strong>$100-$250</strong> including installation. Many auto parts stores will test your battery for free - take advantage of this before cold weather hits.</p>', icon: mccIcon('zap', 16), readTime: '4 min' },
        { title: 'Fluid Check Guide', content: '<p>Your vehicle relies on several different fluids to operate safely and efficiently. Learning to check these fluids yourself takes just a few minutes and can help you catch problems before they become expensive repairs.</p><h4>Essential Vehicle Fluids</h4><ul><li><strong>Engine oil:</strong> Check with the dipstick when the engine is warm. Oil should be amber to dark brown. Black, gritty oil needs changing. Low levels could indicate a leak or burning.</li><li><strong>Coolant (antifreeze):</strong> Check the overflow reservoir when the engine is cool. The level should be between the MIN and MAX marks. Never open the radiator cap when hot.</li><li><strong>Brake fluid:</strong> Located in a clear reservoir near the firewall. Should be clear to light amber. Dark brake fluid should be flushed. Low levels may indicate worn brake pads or a leak.</li><li><strong>Transmission fluid:</strong> Some vehicles have a dipstick; others are sealed. Healthy fluid is red or pink. Brown or burnt-smelling fluid needs attention.</li><li><strong>Power steering fluid:</strong> Check the reservoir under the hood. Low fluid or whining when turning indicates a possible leak.</li></ul><h4>How Often to Check</h4><p>Get in the habit of checking all fluids <strong>once a month</strong> or before any long road trip. It takes less than five minutes and could save you thousands in repairs. Pay attention to any spots under your car where you park - they can indicate leaks.</p><p>If you\\\'re unsure about any fluid\\\'s condition, My Car Concierge can connect you with a provider for a quick inspection and top-off service.</p>', icon: mccIcon('fuel', 16), readTime: '5 min' },
        { title: 'Filter Fundamentals', content: '<p>Filters play a quiet but essential role in your vehicle\\\'s health. They trap contaminants that would otherwise damage your engine or make your cabin uncomfortable. Fortunately, they\\\'re among the cheapest and easiest maintenance items to address.</p><h4>Engine Air Filter</h4><p>Your engine needs clean air to burn fuel efficiently. The <strong>engine air filter</strong> traps dust, pollen, debris, and insects before they enter the engine. A clogged air filter restricts airflow, reducing fuel efficiency and engine performance. Replace every <strong>15,000-30,000 miles</strong>, or more often in dusty environments. Cost: <strong>$15-$40</strong> for the filter, and many car owners can replace it themselves in under five minutes.</p><h4>Cabin Air Filter</h4><p>The <strong>cabin air filter</strong> cleans the air that flows through your heating and air conditioning system. It catches dust, pollen, mold spores, and exhaust fumes. If you notice musty smells from your vents, weak airflow, or increased allergy symptoms while driving, your cabin filter likely needs replacement. Change every <strong>15,000-25,000 miles</strong>. Cost: <strong>$15-$30</strong>.</p><h4>Other Filters to Know About</h4><ul><li><strong>Oil filter:</strong> Replaced with every oil change to remove contaminants from engine oil</li><li><strong>Fuel filter:</strong> Keeps debris out of your fuel injection system (some are serviceable, some are built into the fuel pump)</li><li><strong>Transmission filter:</strong> Changed during transmission fluid service on some vehicles</li></ul><p>Keeping up with filter replacements is one of the most cost-effective ways to protect your vehicle. These are great items to handle during routine maintenance - ask your provider to check all filters during your next service visit.</p>', icon: mccIcon('fuel', 16), readTime: '4 min' }
      ],
      repairs: [
        { title: 'Alternator vs Battery', content: '<p>When your car won\\\'t start, the two most common culprits are the <strong>battery</strong> and the <strong>alternator</strong>. Knowing the difference can save you from replacing the wrong part and wasting money.</p><h4>How to Tell Them Apart</h4><p>The battery stores electrical energy and provides the initial jolt to start your engine. The alternator generates electricity while the engine runs, recharging the battery and powering your car\\\'s electrical systems. Here\\\'s a simple diagnostic approach:</p><ul><li><strong>Dead battery:</strong> Car won\\\'t start but dash lights may flicker. Jump-starting works and the car runs fine afterward. Battery may just need charging or replacement.</li><li><strong>Failing alternator:</strong> Jump-starting works but the car dies again within minutes. Dim or flickering headlights while driving. Battery warning light on the dashboard. Electrical accessories (radio, windows) acting erratic.</li></ul><h4>Cost Expectations</h4><p>A new battery typically costs <strong>$100-$250</strong> installed. An alternator replacement runs <strong>$400-$800</strong> including parts and labor. Before replacing either, have the charging system tested - many auto parts stores offer free battery and alternator testing.</p><p>If you\\\'re unsure which component is the problem, post a service request through My Car Concierge. Our verified providers can diagnose the issue accurately and provide competitive bids for the repair, so you\\\'re not guessing or overpaying.</p>', icon: mccIcon('zap', 16), readTime: '4 min' },
        { title: 'Suspension & Shocks', content: '<p>Your suspension system does more than just give you a comfortable ride. It keeps your tires firmly planted on the road, maintains steering control, and plays a critical role in braking performance. When suspension components wear out, your safety is compromised.</p><h4>Key Suspension Components</h4><ul><li><strong>Shocks (shock absorbers):</strong> Dampen the bouncing motion after hitting bumps. They\\\'re purely dampers and don\\\'t support the vehicle\\\'s weight.</li><li><strong>Struts:</strong> Structural components that combine a shock absorber with a coil spring. They support the vehicle\\\'s weight and are more expensive to replace.</li><li><strong>Control arms and bushings:</strong> Connect the wheels to the frame and allow controlled movement.</li><li><strong>Ball joints:</strong> Pivot points that allow steering and suspension to work together.</li></ul><h4>Signs Your Suspension Needs Attention</h4><p>Watch for these warning signs: a <strong>bouncy ride</strong> that doesn\\\'t settle quickly after bumps, the front end <strong>nose-diving</strong> when braking, the car <strong>leaning excessively</strong> in turns, <strong>uneven tire wear</strong>, or <strong>clunking sounds</strong> over bumps.</p><p>Suspension repairs typically cost <strong>$200-$600 per corner</strong> for strut replacement and <strong>$150-$350</strong> for shock absorbers. Ignoring worn suspension increases braking distance and makes your vehicle harder to control in emergencies. Get a suspension inspection if your vehicle has over 50,000 miles or shows any of the symptoms above.</p>', icon: mccIcon('car', 16), readTime: '4 min' },
        { title: 'Transmission Explained', content: '<p>The transmission is one of the most complex and expensive components in your vehicle. It transfers power from the engine to the wheels and shifts between gear ratios to match your speed and driving conditions. Understanding the basics helps you maintain it properly and recognize problems early.</p><h4>Types of Transmissions</h4><ul><li><strong>Automatic:</strong> Shifts gears for you using a torque converter. Most common in modern vehicles. Requires periodic fluid changes.</li><li><strong>Manual:</strong> You shift gears using a clutch pedal and gear lever. The clutch disc wears over time and eventually needs replacement.</li><li><strong>CVT (Continuously Variable):</strong> Uses a belt and pulley system instead of fixed gears. Common in newer vehicles for fuel efficiency. Requires special CVT fluid.</li></ul><h4>Maintenance Tips</h4><p>Transmission fluid lubricates and cools internal components. Check your owner\\\'s manual for service intervals, but generally plan for a <strong>transmission fluid change every 30,000-60,000 miles</strong>. Some modern transmissions are advertised as "sealed for life," but many mechanics recommend service at 60,000-80,000 miles regardless.</p><h4>Warning Signs of Transmission Problems</h4><p>Watch for <strong>delayed engagement</strong> when shifting from park, <strong>slipping</strong> (engine revs but car doesn\\\'t accelerate), <strong>rough shifting</strong>, <strong>grinding sounds</strong>, or <strong>transmission fluid leaks</strong> (red or brown fluid under your car). Catching issues early can mean the difference between a <strong>$150 fluid service</strong> and a <strong>$2,500-$5,000 transmission rebuild</strong>.</p><p>If you notice any transmission symptoms, don\\\'t delay. Use My Car Concierge to get diagnostic and repair bids from qualified providers quickly.</p>', icon: mccIcon('settings', 16), readTime: '5 min' },
        { title: 'Timing Belt vs Chain', content: '<p>Your engine\\\'s timing belt or chain is a critical component that synchronizes the rotation of the crankshaft and camshaft, ensuring that engine valves open and close at precisely the right moments. If this timing is off, your engine won\\\'t run properly - or at all.</p><h4>Timing Belt (Rubber)</h4><p>Timing belts are made of reinforced rubber and are quieter but have a limited lifespan. They typically need replacement every <strong>60,000-100,000 miles</strong>, depending on the manufacturer. This is a critical maintenance item because a <strong>broken timing belt can cause catastrophic engine damage</strong> in interference engines, where pistons and valves occupy the same space at different times. A timing belt replacement costs <strong>$500-$1,000</strong>, but the engine damage from a failure can exceed <strong>$3,000-$5,000</strong>.</p><h4>Timing Chain (Metal)</h4><p>Timing chains are metal and generally designed to last the life of the engine. However, they\\\'re not maintenance-free. Chains can stretch over time, causing <strong>rattling sounds</strong> on startup or rough idle. Chain guides and tensioners can also wear out. Chain replacement, when needed, costs <strong>$800-$2,000</strong> due to the labor involved.</p><h4>Which Does Your Car Have?</h4><p>Check your owner\\\'s manual or look up your specific engine online. If your vehicle has a timing belt, note the recommended replacement interval and don\\\'t push past it. This is one maintenance item where the cost of prevention is dramatically less than the cost of failure.</p><p>Not sure about your vehicle\\\'s timing system? Ask any My Car Concierge provider during your next service visit - they can tell you what you have and when it\\\'s due for service.</p>', icon: mccIcon('link', 16), readTime: '4 min' },
        { title: 'Catalytic Converter', content: '<p>The catalytic converter is a critical emissions control device located in your exhaust system. It converts harmful pollutants like carbon monoxide, nitrogen oxides, and unburned hydrocarbons into less harmful substances like carbon dioxide and water vapor.</p><h4>Why They\\\'re So Expensive</h4><p>Catalytic converters contain <strong>precious metals</strong> including platinum, palladium, and rhodium, which serve as catalysts for the chemical reactions. These metals make converters valuable - a replacement can cost <strong>$1,000 to $2,500 or more</strong> depending on your vehicle. This value is also why catalytic converter theft has become a widespread problem.</p><h4>Protecting Against Theft</h4><ul><li>Install a <strong>catalytic converter shield</strong> or cage (<strong>$150-$400</strong> installed)</li><li>Park in well-lit areas or garages when possible</li><li>Consider an aftermarket alarm that detects tampering</li><li>Have your VIN etched onto the converter to aid in recovery</li></ul><h4>Signs of a Failing Converter</h4><p>A failing catalytic converter may trigger a <strong>check engine light</strong> (often code P0420), cause <strong>reduced engine performance</strong>, produce a <strong>sulfur or rotten egg smell</strong>, or cause your vehicle to <strong>fail emissions testing</strong>. Sometimes the converter itself isn\\\'t the root problem - issues like bad spark plugs or oil burning can damage a healthy converter, so proper diagnosis is important.</p><p>If your check engine light points to catalytic converter issues, get a thorough diagnosis before agreeing to replacement. Through My Car Concierge, you can get multiple opinions and competitive bids to ensure you\\\'re getting an accurate diagnosis and fair pricing.</p>', icon: mccIcon('sparkles', 16), readTime: '4 min' },
        { title: 'CV Joints & Axles', content: '<p>CV (Constant Velocity) joints are essential components in your drivetrain that allow power to transfer from the transmission to your wheels while accommodating the up-and-down motion of the suspension and the turning of the wheels. Most front-wheel-drive and all-wheel-drive vehicles rely heavily on CV joints.</p><h4>How CV Joints Work</h4><p>Each drive axle has two CV joints - an <strong>inner joint</strong> connected to the transmission and an <strong>outer joint</strong> connected to the wheel hub. These joints are packed with grease and protected by <strong>rubber boots</strong> (CV boots) that keep the grease in and contaminants out. When a boot cracks or tears, dirt and moisture get in and grease leaks out, rapidly destroying the joint.</p><h4>Warning Signs of CV Joint Problems</h4><ul><li><strong>Clicking or popping</strong> sounds when making turns, especially at low speeds</li><li><strong>Grease splattered</strong> on the inside of the wheel or under the car near the wheels</li><li><strong>Vibration</strong> while driving, particularly during acceleration</li><li><strong>Torn or cracked CV boot</strong> visible during inspection</li></ul><h4>Repair Costs</h4><p>If caught early, a <strong>CV boot replacement</strong> costs just <strong>$150-$350</strong> and saves the joint. Once the joint itself is damaged, you\\\'ll need a <strong>complete CV axle replacement</strong>, which runs <strong>$300-$800</strong> per side including parts and labor. Many mechanics recommend replacing the entire axle assembly rather than just the joint, as remanufactured axles are cost-effective and reliable.</p><p>Regular inspections can catch torn CV boots before the joint is damaged. Ask your provider to check CV boots during oil changes or tire rotations - it\\\'s a quick visual inspection that can save you hundreds.</p>', icon: mccIcon('settings', 16), readTime: '4 min' }
      ],
      warningSigns: [
        { title: 'Squealing Brakes', content: '<p>A high-pitched squealing or squeaking sound when you apply the brakes is one of the most common warning signs that your <strong>brake pads are wearing thin</strong>. This sound is actually by design - most brake pads have built-in metal wear indicators that contact the rotor when the pad material gets low, creating that distinctive squeal to alert you.</p><h4>What to Do When You Hear It</h4><p>Don\\\'t panic, but don\\\'t ignore it either. When you first notice brake squealing, you typically have some time before the pads are completely gone, but you should schedule service within the next <strong>1,000-2,000 miles</strong>. The longer you wait, the more you risk:</p><ul><li><strong>Metal-on-metal grinding:</strong> Once pads are completely worn, the metal backing plate grinds against the rotor, causing expensive rotor damage</li><li><strong>Reduced braking performance:</strong> Worn pads take longer to stop your vehicle</li><li><strong>Caliper damage:</strong> Extreme wear can damage the brake caliper pistons</li></ul><h4>Cost Comparison</h4><p>Acting promptly on squealing brakes saves significant money. A straightforward <strong>brake pad replacement costs $150-$300 per axle</strong>. If you wait until the pads damage the rotors, you\\\'re looking at <strong>$400-$800 per axle</strong> for pads and rotors. If calipers are damaged, add another <strong>$200-$400 per caliper</strong>.</p><p>Note that some light squealing when brakes are cold or wet is normal and usually goes away after a few stops. Consistent squealing during normal braking is the warning sign to watch for. Through My Car Concierge, you can quickly get competitive bids for brake service from trusted providers in your area.</p>', icon: mccIcon('bell', 16), severity: 'medium', readTime: '4 min' },
        { title: 'Check Engine Light', content: '<p>The <strong>check engine light</strong> (also called the malfunction indicator lamp or MIL) is your vehicle\\\'s way of telling you that its onboard computer has detected a problem with the engine, emissions system, or related components. It can indicate anything from a minor issue to a serious problem.</p><h4>Steady Light vs. Flashing Light</h4><p>Understanding the difference is critical:</p><ul><li><strong>Steady check engine light:</strong> Indicates a problem that should be diagnosed soon but is not immediately dangerous. You can usually continue driving to your destination and schedule service within the next few days.</li><li><strong>Flashing check engine light:</strong> This is urgent. It typically indicates an <strong>engine misfire</strong> that could damage your catalytic converter. Reduce speed, avoid hard acceleration, and get to a service provider as soon as possible. Continuing to drive aggressively with a flashing light can turn a <strong>$200 repair into a $2,000+ problem</strong>.</li></ul><h4>Common Causes</h4><ul><li><strong>Loose gas cap:</strong> The simplest fix - tighten it and the light may clear after a few drive cycles</li><li><strong>Oxygen sensor failure:</strong> $200-$400 to replace</li><li><strong>Catalytic converter issues:</strong> $1,000-$2,500 to replace</li><li><strong>Mass airflow sensor:</strong> $200-$400 to replace</li><li><strong>Spark plugs or ignition coils:</strong> $100-$300 to replace</li></ul><h4>Getting It Diagnosed</h4><p>Many auto parts stores will read your <strong>OBD-II diagnostic codes</strong> for free. The code gives you a starting point but doesn\\\'t tell the full story - a proper diagnosis requires a trained technician. My Car Concierge\\\'s AI diagnostic tools and verified providers can help you understand what\\\'s wrong and get competitive repair bids.</p>', icon: mccIcon('circle-alert', 16), severity: 'high', readTime: '5 min' },
        { title: 'Burning Smell', content: '<p>A burning smell from your vehicle is always worth investigating. Different types of burning odors point to different problems, and some require immediate attention. Learning to identify these smells can help you describe the issue to your mechanic and understand the urgency.</p><h4>Types of Burning Smells</h4><ul><li><strong>Sweet, syrupy smell:</strong> Almost certainly a <strong>coolant leak</strong>. Coolant (antifreeze) has a distinctive sweet odor. If you smell it inside the cabin, the heater core may be leaking. Outside the car, check for puddles of green, orange, or pink fluid. Driving with a coolant leak can lead to overheating and engine damage.</li><li><strong>Burning oil smell:</strong> Oil may be leaking onto the <strong>hot exhaust manifold</strong> or other engine components. Check for oil spots where you park. Common leak points include valve cover gaskets, oil pan gaskets, and oil filter seals. Cost to fix: <strong>$100-$500</strong> depending on the source.</li><li><strong>Burning rubber:</strong> A <strong>drive belt</strong> may be slipping on a pulley, or a <strong>brake caliper</strong> may be stuck, causing the brake pad to drag against the rotor. A slipping belt often accompanies a squealing sound.</li><li><strong>Electrical/plastic burning:</strong> This could indicate a <strong>wiring problem</strong>, overheating electrical component, or short circuit. This is potentially the most dangerous as it can lead to a vehicle fire.</li><li><strong>Burning carpet or hair:</strong> May indicate <strong>overheated brake pads</strong> from riding the brakes, especially going downhill.</li></ul><h4>What to Do</h4><p>If you smell something burning, try to identify when it occurs (at idle, while driving, after parking). Pull over safely if the smell is strong or accompanied by smoke. For electrical burning smells, stop driving immediately. For other smells, schedule a diagnostic inspection promptly through My Car Concierge to identify and address the source.</p>', icon: mccIcon('search', 16), severity: 'high', readTime: '5 min' },
        { title: 'Vibrations', content: '<p>Unusual vibrations while driving are your vehicle\\\'s way of telling you something is out of balance, worn, or failing. The type of vibration and when it occurs can help narrow down the cause.</p><h4>Vibrations at Highway Speeds</h4><p>If your <strong>steering wheel shakes at 55-70 mph</strong>, the most common causes are:</p><ul><li><strong>Unbalanced tires:</strong> The most likely culprit. A tire balance costs just <strong>$40-$80</strong> for all four tires and usually solves the problem immediately.</li><li><strong>Worn or damaged tires:</strong> Flat spots, bulges, or uneven wear can cause vibration. Inspect your tires visually for obvious issues.</li><li><strong>Bent wheel:</strong> Hitting a pothole or curb can bend a wheel. Repair or replacement costs <strong>$100-$500</strong> per wheel.</li></ul><h4>Vibration When Braking</h4><p>If you feel pulsing or shaking through the <strong>brake pedal or steering wheel when braking</strong>, the most likely cause is <strong>warped brake rotors</strong>. Rotors can warp from excessive heat (hard braking, riding the brakes downhill) or simply from age and wear. Resurfacing rotors costs <strong>$50-$100 per rotor</strong>, while replacement runs <strong>$150-$400 per axle</strong> including pads.</p><h4>General Vibration</h4><p>Vibration felt throughout the entire vehicle at various speeds could point to:</p><ul><li><strong>Worn engine mounts:</strong> Rubber mounts that isolate engine vibration from the cabin. Replacement costs <strong>$200-$600</strong>.</li><li><strong>Drivetrain issues:</strong> Worn U-joints, CV joints, or driveshaft problems</li><li><strong>Suspension wear:</strong> Worn bushings, ball joints, or tie rod ends</li></ul><p>Start with the simplest and cheapest diagnosis first. Have your tires balanced and inspected. If the vibration persists, a My Car Concierge provider can perform a more thorough inspection to identify the root cause.</p>', icon: mccIcon('smartphone', 16), severity: 'medium', readTime: '4 min' },
        { title: 'Pulling to One Side', content: '<p>If your vehicle drifts or pulls to the left or right when you\\\'re driving on a straight, flat road, something is causing unequal forces on your wheels. While this is usually not an emergency, it should be addressed because it affects tire wear, fuel efficiency, and your ability to control the vehicle.</p><h4>Common Causes (From Simplest to Most Complex)</h4><ul><li><strong>Uneven tire pressure:</strong> This is the most common cause and the easiest fix. If one tire has significantly less air pressure than the others, the car will pull toward that side. Check all four tires and inflate to the recommended pressure listed on your door jamb sticker. Cost: <strong>Free</strong>.</li><li><strong>Wheel alignment:</strong> If your wheels aren\\\'t pointing in the right direction, the car will drift. Alignment can shift from hitting potholes, curbs, or normal wear. A four-wheel alignment costs <strong>$80-$150</strong> and should be done annually or whenever you notice pulling.</li><li><strong>Uneven tire wear:</strong> If tires have worn unevenly (often from previous alignment issues), the car may pull even after alignment. Tire rotation or replacement may be needed.</li><li><strong>Stuck brake caliper:</strong> A caliper that doesn\\\'t release fully creates drag on one side. You may also notice a burning smell or the affected wheel being hot after driving.</li><li><strong>Worn suspension components:</strong> Ball joints, tie rod ends, or control arm bushings can wear out and affect alignment geometry.</li></ul><h4>Quick Self-Test</h4><p>On a straight, flat, empty road at low speed, briefly let go of the steering wheel. If the car drifts noticeably to one side, start by checking tire pressures. If pressures are correct, schedule an alignment check. Most alignment shops will inspect your vehicle and let you know if suspension repairs are needed before performing the alignment.</p>', icon: mccIcon('alert-triangle', 16), severity: 'low', readTime: '4 min' },
        { title: 'Strange Noises', content: '<p>Your car communicates through sounds. Learning to identify unusual noises and where they come from can help you catch problems early and give your mechanic valuable diagnostic information. Here\\\'s a guide to the most common car noises and what they typically mean.</p><h4>Noise Diagnosis Guide</h4><ul><li><strong>Clicking or popping when turning:</strong> Almost always a worn <strong>CV joint</strong>, especially at low speeds in tight turns. The outer CV joint is the usual culprit. Fix it before the joint fails completely. Cost: <strong>$300-$800</strong> per axle.</li><li><strong>Grinding when braking:</strong> Brake pads are completely worn and metal is grinding against the rotor. This is causing damage with every stop. Get brake service immediately. Cost: <strong>$400-$800</strong> per axle for pads and rotors.</li><li><strong>Knocking or pinging from the engine:</strong> Could indicate <strong>low-quality fuel</strong>, incorrect fuel octane, <strong>carbon buildup</strong>, or in serious cases, <strong>rod knock</strong> from engine bearing wear. If the knocking is loud and persistent, stop driving and get it towed. Engine bearing failure is catastrophic.</li><li><strong>Hissing under the hood:</strong> A <strong>vacuum leak</strong> or <strong>coolant leak</strong> onto a hot surface. Check for visible steam or fluid. A vacuum leak affects engine performance; a coolant leak can lead to overheating.</li><li><strong>Clunking over bumps:</strong> Worn <strong>suspension components</strong> - likely ball joints, sway bar links, or control arm bushings. Cost: <strong>$100-$400</strong> per component.</li><li><strong>Humming or growling that changes with speed:</strong> Often a worn <strong>wheel bearing</strong>. The sound typically gets louder at higher speeds and may change when turning. Cost: <strong>$300-$600</strong> per wheel.</li><li><strong>Squealing from under the hood:</strong> A worn or loose <strong>serpentine belt</strong>. Usually worse when cold or when accessories are under load. Belt replacement costs <strong>$100-$200</strong>.</li></ul><p>When describing noises to your mechanic, note when they occur (speed, braking, turning, cold starts), where they seem to come from, and whether they\\\'re getting worse. This information significantly speeds up diagnosis. You can also use My Car Concierge\\\'s AI diagnostic tool to help identify potential causes before scheduling service.</p>', icon: mccIcon('search', 16), severity: 'medium', readTime: '5 min' }
      ],
      savingTips: [
        { title: 'Get Multiple Quotes', content: '<p>One of the biggest mistakes car owners make is accepting the first repair quote they receive. Pricing for the same job can vary dramatically between shops, sometimes by <strong>50% or more</strong>. Taking a few minutes to compare prices can save you hundreds of dollars.</p><h4>Why Prices Vary So Much</h4><p>Auto repair pricing depends on several factors: shop overhead costs (rent, equipment, insurance), labor rates (which range from <strong>$80-$180 per hour</strong> depending on location and shop type), parts markup, and even the shop\\\'s current workload. Dealerships typically charge more than independent shops, but they have factory-trained technicians and OEM parts.</p><h4>How to Compare Effectively</h4><ul><li>For any repair estimated at <strong>$300 or more</strong>, get at least 2-3 quotes</li><li>Make sure quotes are for the <strong>same scope of work</strong> - ask for an itemized breakdown of parts and labor</li><li>Ask whether quotes include <strong>OEM or aftermarket parts</strong></li><li>Check if a <strong>warranty</strong> is included on parts and labor</li><li>Don\\\'t automatically choose the cheapest quote - consider reputation and reviews too</li></ul><h4>How My Car Concierge Makes This Easy</h4><p>Instead of calling around to multiple shops, My Car Concierge lets you post your service need once and receive <strong>competitive bids from verified providers</strong>. Each bid is transparent with itemized pricing, and you can compare providers based on ratings, reviews, and proximity. This competitive bidding process typically saves members <strong>15-30%</strong> compared to going to a single shop without shopping around.</p><p>Even for routine maintenance like oil changes and tire rotations, comparing prices over time helps you find reliable providers who offer fair, consistent pricing.</p>', icon: mccIcon('bar-chart', 16), readTime: '4 min' },
        { title: 'Don\\\'t Skip Maintenance', content: '<p>Preventive maintenance is the single most effective way to save money on your vehicle over its lifetime. It might feel like an unnecessary expense when your car seems to be running fine, but skipping scheduled maintenance is a gamble that rarely pays off.</p><h4>The Math of Prevention</h4><p>Consider these real-world examples of what prevention costs versus what failure costs:</p><ul><li><strong>Oil change:</strong> $30-$75 vs. <strong>engine replacement:</strong> $3,000-$7,000</li><li><strong>Coolant flush:</strong> $100-$150 vs. <strong>head gasket repair:</strong> $1,500-$3,000</li><li><strong>Timing belt replacement:</strong> $500-$1,000 vs. <strong>engine rebuild:</strong> $3,000-$6,000</li><li><strong>Transmission fluid service:</strong> $150-$250 vs. <strong>transmission rebuild:</strong> $2,500-$5,000</li><li><strong>Brake pad replacement:</strong> $150-$300 vs. <strong>rotor + caliper damage:</strong> $600-$1,200</li></ul><h4>Building a Maintenance Schedule</h4><p>Your owner\\\'s manual contains a detailed maintenance schedule specific to your vehicle. At minimum, follow these intervals:</p><ul><li><strong>Every 5,000-7,500 miles:</strong> Oil change, tire rotation, multi-point inspection</li><li><strong>Every 15,000-30,000 miles:</strong> Air filter, cabin filter, brake inspection</li><li><strong>Every 30,000-60,000 miles:</strong> Transmission fluid, coolant, spark plugs</li><li><strong>Every 60,000-100,000 miles:</strong> Timing belt (if applicable), major fluid services</li></ul><p>My Car Concierge helps you stay on track by letting you log maintenance history and get reminders when services are due. Consistent records also increase your vehicle\\\'s resale value.</p>', icon: mccIcon('calendar', 16), readTime: '4 min' },
        { title: 'Understand the Diagnosis', content: '<p>Knowledge is power when it comes to auto repair. You don\\\'t need to become a mechanic, but understanding the basics of what\\\'s being recommended helps you make informed decisions and avoid unnecessary work.</p><h4>Questions to Ask Your Mechanic</h4><ul><li><strong>"Can you show me the problem?"</strong> A reputable provider will show you worn brake pads, a leaking gasket, or a damaged belt. If they can\\\'t or won\\\'t show you, that\\\'s a red flag.</li><li><strong>"What happens if I wait?"</strong> Understanding urgency helps you prioritize. Some repairs are safety-critical; others can wait a few weeks or months.</li><li><strong>"Is this related to the original issue?"</strong> Sometimes additional repairs are genuinely needed, but upselling is common. Make sure add-on recommendations are connected to the problem you came in for.</li><li><strong>"What are my options?"</strong> There\\\'s often more than one solution. OEM vs. aftermarket parts, repair vs. replacement, or different levels of service.</li></ul><h4>Red Flags to Watch For</h4><p>Be cautious if a shop: pressures you to decide immediately, won\\\'t provide a written estimate, dramatically increases the price after work begins, or recommends services your owner\\\'s manual doesn\\\'t call for at your mileage.</p><p>A trustworthy provider takes time to explain repairs in plain language, provides written estimates before starting work, and respects your right to get a second opinion. My Car Concierge\\\'s verified providers are rated by other members, so you can choose providers known for transparency and honest communication.</p>', icon: mccIcon('search', 16), readTime: '4 min' },
        { title: 'Know What\\\'s Urgent', content: '<p>Not every car problem requires an immediate trip to the mechanic. Understanding the difference between urgent, soon, and can-wait repairs helps you budget effectively, avoid panic decisions, and keep your vehicle safe.</p><h4>Fix Immediately (Safety-Critical)</h4><ul><li><strong>Brakes:</strong> Grinding sounds, spongy brake pedal, brake warning light, or pulling when braking</li><li><strong>Tires:</strong> Bulges, exposed cords, severe uneven wear, or tread below 2/32"</li><li><strong>Steering:</strong> Excessive play, power steering failure, or unusual resistance</li><li><strong>Flashing check engine light:</strong> Indicates active engine misfire</li><li><strong>Overheating:</strong> Temperature gauge in the red zone or steam from the hood</li></ul><h4>Fix Soon (Within 1-2 Weeks)</h4><ul><li><strong>Steady check engine light:</strong> Get diagnosed but not necessarily an emergency</li><li><strong>Oil leaks:</strong> Monitor oil level and fix before it becomes severe</li><li><strong>Unusual noises:</strong> Investigate before they become worse and more expensive</li><li><strong>AC or heater issues:</strong> Comfort-related but can affect defogging in winter</li></ul><h4>Can Wait (Plan and Budget)</h4><ul><li><strong>Cosmetic damage:</strong> Dents, scratches, faded paint</li><li><strong>Minor convenience items:</strong> Power window switch, interior light, non-critical sensors</li><li><strong>Upcoming maintenance:</strong> Services due within the next few thousand miles</li></ul><p>Don\\\'t let a shop use scare tactics to pressure you into same-day repairs for non-urgent issues. Get a written diagnosis, take it home, and use My Car Concierge to compare bids at your own pace.</p>', icon: mccIcon('clock', 16), readTime: '4 min' },
        { title: 'OEM vs Aftermarket Parts', content: '<p>When your vehicle needs parts replaced, you\\\'ll often have a choice between <strong>OEM (Original Equipment Manufacturer)</strong> parts and <strong>aftermarket</strong> alternatives. Understanding the differences helps you make the right choice for your budget and your vehicle.</p><h4>OEM Parts</h4><p>OEM parts are made by or for your vehicle\\\'s manufacturer to the same specifications as the original parts in your car. They offer guaranteed fitment and quality, and they\\\'re what the dealership uses.</p><ul><li><strong>Pros:</strong> Exact fit, consistent quality, manufacturer warranty, maintains vehicle value</li><li><strong>Cons:</strong> More expensive (often 20-60% more than aftermarket), limited availability outside dealerships</li></ul><h4>Aftermarket Parts</h4><p>Aftermarket parts are made by third-party companies. Quality ranges widely from budget options to premium brands that meet or exceed OEM specifications.</p><ul><li><strong>Pros:</strong> Lower cost, wider availability, variety of quality levels and price points, some brands offer better-than-OEM performance</li><li><strong>Cons:</strong> Quality inconsistency between brands, fitment may vary, may not match exact specifications</li></ul><h4>When to Choose Which</h4><ul><li><strong>Use OEM for:</strong> Safety-critical components (brakes, steering, suspension), under-warranty vehicles, engine and transmission internals</li><li><strong>Use quality aftermarket for:</strong> Brake pads and rotors (reputable brands like Wagner, Bosch), filters, belts, hoses, sensors, exterior trim</li><li><strong>Avoid cheap aftermarket for:</strong> Any component where failure could leave you stranded or compromise safety</li></ul><p>When getting bids through My Car Concierge, providers specify what parts they\\\'ll use. You can compare quotes with OEM and aftermarket options side by side to make the best choice for your situation and budget.</p>', icon: mccIcon('store', 16), readTime: '4 min' },
        { title: 'DIY What You Can', content: '<p>You don\\\'t need to be a mechanic to handle some basic car maintenance yourself. Several routine tasks require minimal tools and skill, and doing them yourself saves labor costs while helping you stay connected with your vehicle\\\'s condition.</p><h4>Easy DIY Tasks (No Experience Needed)</h4><ul><li><strong>Check and inflate tires:</strong> A tire pressure gauge costs $5-$10. Check monthly and use a gas station air pump to adjust. Proper pressure saves fuel and extends tire life.</li><li><strong>Replace wiper blades:</strong> Costs $15-$30 and takes 5 minutes. Most auto parts stores will even install them for free if you buy there.</li><li><strong>Top off washer fluid:</strong> Buy a gallon of washer fluid for $3-$5 and fill the clearly marked reservoir under the hood.</li><li><strong>Replace engine air filter:</strong> Costs $15-$40 and takes 5-10 minutes. Usually just unclip the airbox, swap the filter, and reclip.</li><li><strong>Replace cabin air filter:</strong> Costs $15-$30. Usually located behind the glove box - many can be accessed without any tools.</li></ul><h4>Intermediate DIY (Some Comfort Required)</h4><ul><li><strong>Battery replacement:</strong> Disconnect negative terminal first, then positive. Reverse the order when installing the new one.</li><li><strong>Headlight or taillight bulb replacement:</strong> Varies by vehicle but often straightforward.</li><li><strong>Brake pad inspection:</strong> You can visually check pad thickness through most wheels without removing anything.</li></ul><h4>Leave These to Professionals</h4><p>Some jobs require specialized tools, lifts, or expertise: brake repair, suspension work, engine or transmission service, electrical diagnostics, and anything involving the fuel system. For these jobs, use My Car Concierge to find qualified providers and get competitive bids. The money you save on DIY tasks can be put toward professional service where it\\\'s truly needed.</p>', icon: mccIcon('wrench', 16), readTime: '4 min' }
      ],
      rideshare: [
        { title: 'Accelerated Maintenance Schedules', content: '<p>As a rideshare driver putting <strong>30,000-50,000+ miles per year</strong> on your vehicle, standard maintenance schedules simply don\\\'t apply. Your car is a business asset that\\\'s working harder and faster than a typical commuter vehicle, and your maintenance plan needs to reflect that reality.</p><h4>Adjusted Intervals for High-Mileage Drivers</h4><ul><li><strong>Oil changes:</strong> Every 3,000-5,000 miles instead of the standard 7,500-10,000. High-mileage driving accelerates oil breakdown, and your engine is under constant stress.</li><li><strong>Brake pads:</strong> May last only 15,000-25,000 miles with constant city stop-and-go, compared to 30,000-70,000 miles for normal driving.</li><li><strong>Tire rotation:</strong> Every 5,000 miles to maximize tire life. Consider replacing tires every 25,000-35,000 miles.</li><li><strong>Transmission fluid:</strong> Every 30,000 miles, especially with frequent city driving and constant gear changes.</li><li><strong>Coolant flush:</strong> Every 30,000 miles or 2 years, whichever comes first.</li></ul><h4>Building Your Schedule</h4><p>Create a <strong>mileage-based maintenance calendar</strong> rather than a time-based one. Track your current mileage and set reminders at each interval. Keep a detailed log of every service performed, including date, mileage, service type, cost, and provider. This record serves multiple purposes: it helps you budget, proves maintenance history for resale, and may be needed for tax documentation.</p><p>My Car Concierge makes tracking maintenance easy and helps you find competitive pricing for routine services. When you\\\'re putting this many miles on your vehicle, even small savings per service add up to hundreds of dollars annually.</p>', icon: mccIcon('calendar', 16), readTime: '4 min' },
        { title: 'City Driving Wear Patterns', content: '<p>City driving is the most demanding environment for any vehicle. The constant acceleration, braking, idling in traffic, and navigating rough urban roads put significantly more stress on your car than highway cruising. Understanding these wear patterns helps you anticipate repairs and budget accordingly.</p><h4>Components That Wear Faster in City Driving</h4><ul><li><strong>Brakes:</strong> City brakes wear <strong>2-3 times faster</strong> than highway driving. Constant stop-and-go cycling generates more heat and friction. Budget for brake service every 15,000-25,000 miles.</li><li><strong>Transmission:</strong> Constant gear shifting in traffic (especially in automatic transmissions) causes the fluid to degrade faster and puts more stress on internal components. Change fluid every 30,000 miles.</li><li><strong>Cooling system:</strong> Idling in traffic with no airflow means your cooling system works overtime. The radiator fan runs more, coolant degrades faster, and thermostat cycling increases.</li><li><strong>Suspension:</strong> Potholes, speed bumps, and uneven roads beat up shocks, struts, control arm bushings, and ball joints. Inspect suspension components every 20,000 miles.</li><li><strong>Engine mounts:</strong> Constant vibration from stop-and-go driving can crack rubber engine mounts over time, leading to increased cabin vibration.</li></ul><h4>Budgeting for City Wear</h4><p>As a rule of thumb, expect to spend <strong>30-50% more on maintenance</strong> compared to a primarily highway-driven vehicle at the same mileage. Build a monthly maintenance fund based on your driving volume. Tracking your actual expenses through My Car Concierge helps you forecast future costs accurately and spot trends that might indicate emerging problems.</p>', icon: mccIcon('store', 16), readTime: '4 min' },
        { title: 'Cost-Per-Mile Calculations', content: '<p>Understanding your true <strong>cost per mile</strong> is essential for determining whether rideshare driving is profitable for you. Many drivers focus only on fuel costs and dramatically underestimate what it truly costs to operate their vehicle.</p><h4>What to Include in Your Calculation</h4><p>Your total cost per mile should account for every expense related to your vehicle:</p><ul><li><strong>Fuel:</strong> Track every fill-up. Divide your total fuel cost by total miles driven.</li><li><strong>Insurance:</strong> Your annual premium divided by annual miles. Note: rideshare driving may require additional coverage.</li><li><strong>Maintenance:</strong> Oil changes, filters, brake service, tire rotations, fluid services - everything scheduled.</li><li><strong>Repairs:</strong> Unplanned fixes, from minor sensor replacements to major component failures.</li><li><strong>Depreciation:</strong> The decrease in your vehicle\\\'s value. High-mileage vehicles depreciate faster. Estimate <strong>$0.10-$0.20 per mile</strong> for depreciation on most vehicles.</li><li><strong>Car washes and detailing:</strong> Essential for maintaining passenger ratings.</li><li><strong>Phone mount, chargers, and accessories:</strong> Business expenses that add up.</li></ul><h4>Running the Numbers</h4><p>Most rideshare drivers find their true cost per mile falls between <strong>$0.30 and $0.60</strong>, depending on vehicle type, fuel efficiency, and maintenance discipline. Compare this to your earnings per mile from the platform to determine true profitability. If your costs approach or exceed your per-mile earnings, it may be time to evaluate whether a more fuel-efficient vehicle would improve your margins.</p><p>A well-maintained vehicle consistently has a <strong>lower cost per mile</strong> than one driven to failure. Preventive maintenance through My Car Concierge\\\'s competitive bidding helps keep those costs under control.</p>', icon: mccIcon('dollar-sign', 16), readTime: '5 min' },
        { title: 'Tax Deduction Essentials', content: '<p>As a rideshare driver, your vehicle expenses may be <strong>tax-deductible</strong>, potentially saving you thousands of dollars annually. However, taking advantage of these deductions requires consistent, detailed record-keeping throughout the year.</p><h4>Two Methods for Vehicle Deductions</h4><ul><li><strong>Standard mileage rate:</strong> The IRS sets a rate per mile for business driving (check the current year\\\'s rate). You simply multiply your business miles by this rate. This method is simpler but may result in a smaller deduction if you have high actual expenses.</li><li><strong>Actual expense method:</strong> You deduct the actual costs of operating your vehicle for business, including fuel, insurance, maintenance, repairs, depreciation, and financing costs. You must calculate the percentage of total miles that were for business.</li></ul><h4>Essential Records to Keep</h4><ul><li><strong>Mileage log:</strong> Date, starting point, destination, purpose, and miles driven for every trip. Many apps can automate this tracking.</li><li><strong>Receipts:</strong> Save every receipt for fuel, maintenance, repairs, car washes, tolls, and parking fees.</li><li><strong>Insurance documentation:</strong> Your premium statements and any rideshare-specific coverage.</li><li><strong>Vehicle purchase records:</strong> If using the actual expense method, you\\\'ll need documentation of your vehicle\\\'s purchase price for depreciation calculations.</li></ul><h4>Important Notes</h4><p>You can only deduct expenses for <strong>business miles</strong>, not personal driving. Commuting from home to a regular job is not deductible, but miles driven while actively working for a rideshare platform generally are. Consult a tax professional who understands gig economy deductions to maximize your benefits and ensure compliance. My Car Concierge\\\'s maintenance tracking provides organized records that make tax time much easier.</p>', icon: mccIcon('clipboard-list', 16), readTime: '5 min' },
        { title: 'Protecting Resale Value', content: '<p>High-mileage rideshare vehicles depreciate faster than average, but strategic decisions can help you <strong>minimize the financial hit</strong> when it\\\'s time to sell or trade in. Think of resale value protection as an ongoing investment, not a last-minute effort.</p><h4>Maintenance Records Are Worth Money</h4><p>A complete set of maintenance records can add <strong>$500-$2,000 or more</strong> to your vehicle\\\'s resale value. Buyers and dealers pay premium prices for vehicles with documented service history because it reduces their risk. Keep records of every oil change, tire rotation, brake service, and repair with dates, mileage, and receipts.</p><h4>Strategies to Maximize Resale</h4><ul><li><strong>Address cosmetic issues promptly:</strong> Small dents, scratches, and chips are inexpensive to fix early but create a negative impression if accumulated. Touch-up paint ($10-$20) can prevent rust from forming around chips.</li><li><strong>Professional detailing before selling:</strong> A $150-$300 professional detail (interior deep clean, exterior polish, engine bay cleaning) can increase your sale price by far more than its cost.</li><li><strong>Maintain interior quality:</strong> Use seat covers and floor mats to protect original surfaces. Clean regularly to prevent stains from setting permanently.</li><li><strong>Stay current on recalls:</strong> Complete all manufacturer recalls promptly - open recalls reduce buyer confidence.</li></ul><h4>Timing Your Exit</h4><p>Plan your vehicle transition strategically. Selling at <strong>80,000-100,000 miles</strong> typically gets significantly better value than waiting until 150,000+ miles. Many major maintenance items (timing belt, transmission service) come due around 100,000 miles, and buyers factor those upcoming costs into their offer. If you\\\'re approaching a major milestone, consider selling before those services are due.</p>', icon: mccIcon('dollar-sign', 16), readTime: '4 min' },
        { title: 'Passenger Comfort & Safety', content: '<p>In the rideshare business, your vehicle\\\'s condition directly impacts your <strong>ratings, tips, and earning potential</strong>. Passengers form an impression within seconds of entering your car, and that impression affects every aspect of your income.</p><h4>Comfort Essentials</h4><ul><li><strong>Cabin air filter:</strong> Replace every 10,000-15,000 miles (more frequently than the standard interval) to keep the air fresh. A musty or stale smell is an instant rating killer. Cost: <strong>$15-$30</strong>.</li><li><strong>Climate control:</strong> Ensure your AC blows cold in summer and your heater works well in winter. AC system recharges cost <strong>$150-$300</strong> and are worth every penny.</li><li><strong>Interior cleanliness:</strong> Vacuum seats and floors at least weekly. Wipe down all surfaces including door handles, seat belt buckles, and center console. Use a subtle, non-overpowering air freshener or none at all.</li><li><strong>USB charging ports:</strong> Make sure all charging ports work. Carry both Lightning and USB-C cables. A $15 multi-port car charger is a worthwhile investment.</li><li><strong>Phone mount:</strong> A clean, professional-looking mount shows you\\\'re serious about the job and keeps navigation visible without holding your phone.</li></ul><h4>Safety Checks</h4><ul><li><strong>Seat belts:</strong> Test all passenger seat belts regularly. They must latch securely, retract properly, and release easily.</li><li><strong>Door handles and locks:</strong> All doors should open and close smoothly from inside and outside.</li><li><strong>Lights:</strong> Interior dome lights, headlights, brake lights, and turn signals all need to work properly.</li><li><strong>Tires:</strong> Bald or underinflated tires put passengers at risk. Maintain proper tread depth and pressure.</li></ul><p>Regular vehicle maintenance through My Car Concierge ensures your car is always passenger-ready. Happy passengers mean consistent 5-star ratings and better tips.</p>', icon: mccIcon('star', 16), readTime: '4 min' }
      ],
      commercial: [
        { title: 'Heavy-Duty Brake Systems', content: '<p>Commercial vehicles carrying passengers or heavy cargo place enormous demands on their braking systems. Whether you\\\'re operating a shuttle bus, delivery van, or passenger transport vehicle, your brakes are working significantly harder than those on a standard passenger car, and your maintenance approach must reflect this.</p><h4>Understanding Commercial Brake Systems</h4><p>Commercial vehicles may use <strong>disc brakes, drum brakes, or a combination</strong> of both. Larger vehicles like buses often use <strong>air brake systems</strong> instead of hydraulic brakes. Each type requires specific maintenance knowledge:</p><ul><li><strong>Disc brakes:</strong> Similar to passenger cars but with larger, heavier-duty components. Pads and rotors wear faster under heavy loads.</li><li><strong>Drum brakes:</strong> Common on rear axles of vans and trucks. Shoes wear against drums and require periodic adjustment. Drums should be inspected for cracks and scoring.</li><li><strong>Air brakes:</strong> Use compressed air instead of hydraulic fluid. Require regular inspection of air compressors, air dryers, slack adjusters, brake chambers, and air lines. Air system leaks must be repaired immediately.</li></ul><h4>Inspection Frequency</h4><p>For commercial vehicles, inspect brake components at minimum every <strong>10,000-15,000 miles</strong>, or more frequently if you\\\'re carrying heavy loads daily. Listen for squealing, grinding, or air leaks. Feel for pulling, vibration, or spongy pedal response. Any abnormality should be addressed immediately - <strong>brake failure while carrying passengers or cargo is not an option</strong>.</p><p>Budget <strong>$300-$1,000 per axle</strong> for commercial brake service, depending on the vehicle type and components involved. My Car Concierge can connect you with providers experienced in commercial vehicle brake systems to ensure the work is done correctly.</p>', icon: mccIcon('circle-alert', 16), readTime: '5 min' },
        { title: 'Transmission Care for Heavy Loads', content: '<p>The transmission in a commercial vehicle works significantly harder than one in a standard passenger car. Carrying heavy loads, towing, and constant stop-and-go operation all accelerate wear on transmission components. Proper care can extend your transmission\\\'s life and prevent costly breakdowns.</p><h4>Why Heavy Loads Stress Transmissions</h4><p>When your vehicle carries heavy passengers or cargo, the transmission must work harder to get the vehicle moving and to change gears. This generates more <strong>heat</strong> - the primary enemy of transmission longevity. Heat breaks down transmission fluid faster, hardens seals, and accelerates wear on clutch packs and bands. Towing or operating at maximum capacity amplifies these effects dramatically.</p><h4>Maintenance Best Practices</h4><ul><li><strong>Fluid changes:</strong> Change transmission fluid every <strong>25,000-30,000 miles</strong> for heavy-use commercial vehicles, compared to 60,000+ miles for normal passenger car use.</li><li><strong>Use the correct fluid:</strong> Commercial vehicles often require specific transmission fluid types. Using the wrong fluid can cause shifting problems and accelerate wear. Always check your owner\\\'s manual.</li><li><strong>Consider a transmission cooler:</strong> An auxiliary transmission cooler (<strong>$150-$400</strong> installed) can significantly reduce operating temperatures and extend transmission life.</li><li><strong>Avoid overloading:</strong> Know your vehicle\\\'s <strong>Gross Vehicle Weight Rating (GVWR)</strong> and never exceed it. Overloading doesn\\\'t just stress the transmission - it affects brakes, suspension, and tires too.</li><li><strong>Monitor for symptoms:</strong> Delayed shifts, slipping, harsh engagement, or unusual noises all indicate transmission problems developing.</li></ul><p>A transmission rebuild for a commercial vehicle can cost <strong>$3,000-$7,000 or more</strong>. Preventive maintenance is dramatically cheaper. Track your fluid service intervals through My Car Concierge and get competitive bids from providers experienced with commercial transmissions.</p>', icon: mccIcon('settings', 16), readTime: '5 min' },
        { title: 'Pre-Trip Inspection Basics', content: '<p>A thorough <strong>pre-trip inspection</strong> is one of the most important habits a commercial driver can develop. For many commercial vehicle operators, it\\\'s not just good practice - it\\\'s a legal requirement. Even if regulations don\\\'t apply to your specific vehicle class, a systematic inspection before each trip protects you, your passengers, and your livelihood.</p><h4>Pre-Trip Inspection Checklist</h4><ul><li><strong>Tires:</strong> Check all tires for proper inflation, adequate tread depth, and visible damage (cuts, bulges, foreign objects). Don\\\'t forget the spare.</li><li><strong>Lights:</strong> Test headlights (low and high beam), brake lights, turn signals, hazard lights, reverse lights, and marker lights. Have someone walk around the vehicle while you activate each light.</li><li><strong>Brakes:</strong> Test brake pedal feel before moving. Check for air brake pressure buildup if applicable. Listen for unusual sounds during first stops.</li><li><strong>Fluids:</strong> Check engine oil, coolant, brake fluid, and windshield washer fluid levels.</li><li><strong>Under the vehicle:</strong> Look for fresh leaks - oil, coolant, brake fluid, or transmission fluid on the ground.</li><li><strong>Mirrors:</strong> Ensure all mirrors are properly adjusted and clean.</li><li><strong>Horn:</strong> Verify the horn works.</li><li><strong>Wipers and washers:</strong> Test windshield wipers for proper operation and washer fluid spray.</li><li><strong>Seat belts:</strong> Check that all passenger seat belts latch and release properly.</li><li><strong>Emergency equipment:</strong> Verify fire extinguisher is charged, first aid kit is stocked, and reflective triangles are accessible.</li></ul><h4>Documenting Your Inspections</h4><p>Keep a written or digital log of each pre-trip inspection. Note the date, time, mileage, and any issues found. This documentation protects you in case of incidents and demonstrates professionalism. Many jurisdictions require commercial drivers to maintain inspection logs. My Car Concierge\\\'s maintenance tracking features can help you organize these records efficiently.</p>', icon: mccIcon('check-circle', 16), readTime: '5 min' },
        { title: 'Cooling System Demands', content: '<p>Commercial vehicles face unique cooling challenges. Engines running for extended periods, carrying heavy loads, and operating in stop-and-go traffic generate significantly more heat than typical passenger car driving. A cooling system failure can destroy an engine in minutes, so proactive maintenance is essential.</p><h4>Why Commercial Vehicles Run Hotter</h4><p>Several factors combine to stress your cooling system:</p><ul><li><strong>Extended operation:</strong> Commercial vehicles often run for hours without rest, giving the cooling system no break.</li><li><strong>Heavy loads:</strong> More weight means the engine works harder, generating more heat.</li><li><strong>Idling:</strong> Long idle periods (loading passengers, waiting in queues) reduce airflow through the radiator, forcing the cooling fan to work harder.</li><li><strong>Stop-and-go traffic:</strong> Constant acceleration under load without sustained airflow pushes temperatures higher.</li></ul><h4>Cooling System Maintenance</h4><ul><li><strong>Check coolant levels weekly:</strong> Low coolant is the most common cause of overheating. Top off as needed and investigate any persistent drops - they indicate a leak.</li><li><strong>Coolant flush:</strong> Every <strong>24,000-30,000 miles</strong> or 2 years for commercial use. Old coolant loses its ability to transfer heat and protect against corrosion.</li><li><strong>Inspect belts and hoses:</strong> Look for cracks, swelling, soft spots, or leaks at connections. A burst hose or broken belt while operating can leave you stranded with a potential engine damage situation.</li><li><strong>Radiator condition:</strong> Keep the radiator clean and free of debris. Blocked fins reduce cooling efficiency significantly.</li><li><strong>Temperature gauge awareness:</strong> Monitor your temperature gauge regularly. If it climbs above normal, take action immediately - pull over, let the engine cool, and investigate before proceeding.</li></ul><p>If you frequently operate at or near capacity, consider upgrading to a <strong>heavy-duty radiator</strong> or adding an <strong>auxiliary cooling fan</strong>. These investments (<strong>$300-$800</strong>) can prevent catastrophic engine failure that would cost thousands to repair.</p>', icon: mccIcon('search', 16), readTime: '5 min' },
        { title: 'Suspension & Steering Under Load', content: '<p>Commercial vehicles carrying heavy loads place extraordinary stress on suspension and steering components. These systems are critical not only for ride comfort but for <strong>vehicle control, tire life, and braking performance</strong>. Worn suspension in a loaded commercial vehicle is a serious safety concern.</p><h4>How Heavy Loads Affect Suspension</h4><p>When your vehicle is loaded to capacity, every suspension component bears additional stress. Springs compress more, shocks work harder to control body motion, bushings flex more, and ball joints carry more weight. Over time, this accelerated wear leads to component failure that\\\'s more dangerous in a heavy vehicle than in a standard car.</p><h4>Components to Monitor</h4><ul><li><strong>Shocks and struts:</strong> Look for oil leaks on shock bodies, excessive bouncing, or nose-diving when braking. Replace immediately if leaking. Heavy-duty replacements cost <strong>$200-$500 per corner</strong>.</li><li><strong>Ball joints:</strong> Critical pivot points that wear under load. A failed ball joint can cause loss of steering control. Check for play and listen for popping sounds. Cost: <strong>$200-$500 per joint</strong> installed.</li><li><strong>Tie rod ends:</strong> Connect steering to wheels. Worn tie rods cause wandering steering and uneven tire wear. Cost: <strong>$150-$400 per side</strong>.</li><li><strong>Leaf springs (if equipped):</strong> Common on vans and trucks. Look for cracked or broken leaves and sagging. Heavy-duty replacement springs are available for vehicles that consistently carry maximum loads.</li><li><strong>Wheel alignment:</strong> Heavy loads can shift alignment settings. Get alignment checked every <strong>10,000-15,000 miles</strong> or whenever you notice pulling or uneven tire wear.</li></ul><h4>Safety Implications</h4><p>Worn suspension doesn\\\'t just cause a rough ride - it <strong>increases braking distances</strong>, reduces steering responsiveness, and accelerates tire wear. For a vehicle carrying passengers, these are unacceptable risks. Schedule regular suspension inspections through My Car Concierge and address issues before they compromise safety.</p>', icon: mccIcon('wrench', 16), readTime: '4 min' },
        { title: 'Fleet Maintenance Records', content: '<p>Proper maintenance documentation is not just good practice for commercial vehicles - it\\\'s often a <strong>legal requirement</strong>. Beyond compliance, detailed records help you control costs, predict maintenance needs, prove vehicle condition, and maximize resale value.</p><h4>What to Document</h4><p>Every maintenance event should include the following information:</p><ul><li><strong>Date and mileage:</strong> When the service was performed and the odometer reading at that time.</li><li><strong>Service performed:</strong> Detailed description of work done, including parts replaced and fluids used.</li><li><strong>Provider information:</strong> Who performed the work, including business name, contact information, and technician name if possible.</li><li><strong>Cost breakdown:</strong> Itemized parts and labor costs for each service.</li><li><strong>Next service due:</strong> Mileage or date for the next scheduled maintenance of each type.</li></ul><h4>Fuel Consumption Tracking</h4><p>Tracking fuel consumption (miles per gallon over time) is a powerful diagnostic tool. A sudden drop in fuel efficiency can indicate developing problems:</p><ul><li><strong>5-10% drop:</strong> Check tire pressure, air filter, and spark plugs.</li><li><strong>10-20% drop:</strong> Possible fuel system, oxygen sensor, or engine management issue.</li><li><strong>20%+ drop:</strong> Significant mechanical problem developing - get a diagnostic inspection promptly.</li></ul><h4>Regulatory Compliance</h4><p>Many jurisdictions require commercial vehicles to maintain maintenance logs that include DOT inspection records, brake inspection documentation, and tire condition records. Failure to maintain proper records can result in fines and can affect your operating authority. Even if not legally required for your vehicle class, comprehensive records demonstrate professionalism and due diligence.</p><p>My Car Concierge\\\'s maintenance tracking features make it easy to organize and access your records digitally. Having everything in one place simplifies compliance, insurance claims, warranty disputes, and eventual vehicle resale.</p>', icon: mccIcon('folder-open', 16), readTime: '4 min' }
      ],
      glossary: [
        { term: 'Alignment', definition: 'Adjusting the angles of your wheels so they\'re perpendicular to the ground and parallel to each other. Proper alignment prevents uneven tire wear.' },
        { term: 'Alternator', definition: 'Generates electricity while the engine runs to charge the battery and power electrical systems.' },
        { term: 'Brake Caliper', definition: 'Squeezes brake pads against the rotor to slow your wheels. Contains pistons that push when you press the brake pedal.' },
        { term: 'Brake Rotor', definition: 'The disc that spins with your wheel. Brake pads squeeze it to slow you down. Also called a brake disc.' },
        { term: 'Catalytic Converter', definition: 'Emissions device that converts harmful exhaust gases into less harmful ones. Contains precious metals; theft is common.' },
        { term: 'Coolant', definition: 'Liquid that circulates through your engine to prevent overheating. Also called antifreeze because it lowers the freezing point in winter.' },
        { term: 'CV Joint', definition: 'Constant Velocity joint - allows power to transfer to wheels while they turn and move up/down with suspension.' },
        { term: 'Differential', definition: 'Allows wheels to spin at different speeds when turning. Located between drive wheels.' },
        { term: 'Direct Injection', definition: 'Fuel delivery system that sprays fuel directly into the cylinder. More efficient but can cause carbon buildup on intake valves.' },
        { term: 'ECU/ECM', definition: 'Engine Control Unit/Module - the computer that manages your engine. Controls fuel injection, ignition timing, and more.' },
        { term: 'Exhaust Manifold', definition: 'Collects exhaust gases from engine cylinders and directs them to the catalytic converter and muffler.' },
        { term: 'Head Gasket', definition: 'Seals the gap between engine block and cylinder head. Failure causes coolant/oil mixing and overheating. Expensive repair.' },
        { term: 'Ignition Coil', definition: 'Converts battery voltage to the high voltage needed to create a spark in the spark plugs.' },
        { term: 'OBD-II', definition: 'On-Board Diagnostics port under your dashboard. Mechanics plug in scanners here to read error codes and diagnose problems.' },
        { term: 'Radiator', definition: 'Cools your engine by transferring heat from coolant to the air. Located at the front of your car behind the grille.' },
        { term: 'Serpentine Belt', definition: 'Single belt that drives multiple components: alternator, power steering pump, AC compressor, water pump. Needs periodic replacement.' },
        { term: 'Spark Plug', definition: 'Creates the electrical spark that ignites fuel in gasoline engines. Replace every 30,000-100,000 miles depending on type.' },
        { term: 'Struts/Shocks', definition: 'Suspension components that absorb bumps and keep tires on the road. Struts are structural; shocks are just dampers.' },
        { term: 'Thermostat', definition: 'Valve that regulates coolant flow to maintain optimal engine temperature. A stuck thermostat causes overheating or slow warming.' },
        { term: 'Timing Belt/Chain', definition: 'Synchronizes engine valve opening with piston movement. Belts need replacement; chains usually last the engine\'s life.' },
        { term: 'Torque', definition: 'Rotational force - what gets your car moving from a stop. Measured in pound-feet (lb-ft) or Newton-meters (Nm).' },
        { term: 'Transmission', definition: 'Transfers engine power to wheels and changes gear ratios for speed and torque. Automatic or manual.' },
        { term: 'Turbocharger', definition: 'Uses exhaust gas to spin a turbine that compresses intake air, increasing engine power. Requires more cooling and maintenance.' },
        { term: 'VIN', definition: 'Vehicle Identification Number - unique 17-character code identifying your specific vehicle. Found on dashboard and door jamb.' },
        { term: 'Wheel Bearing', definition: 'Allows wheels to spin smoothly. Worn bearings make humming/growling noise that changes with speed.' },
        { term: 'DOT Inspection', definition: 'Department of Transportation safety inspection required for commercial vehicles. Covers brakes, lights, tires, steering, and other safety-critical systems.' },
        { term: 'Pre-Trip Inspection', definition: 'A systematic check of vehicle safety components before driving. Required for commercial drivers; recommended for all high-mileage drivers.' },
        { term: 'Cost Per Mile', definition: 'Total operating cost divided by miles driven. Includes fuel, maintenance, insurance, depreciation, and repairs. Essential metric for rideshare and commercial drivers.' },
        { term: 'Fleet Maintenance', definition: 'Scheduled maintenance program for multiple vehicles. Emphasizes preventive care, detailed record-keeping, and minimizing downtime.' },
        { term: 'Heavy-Duty', definition: 'Components designed for commercial use and higher stress levels. Often found on vans, buses, and trucks. Built for durability over long service life.' },
        { term: 'Air Brakes', definition: 'Braking system using compressed air instead of hydraulic fluid. Common on buses, trucks, and large commercial vehicles. Requires specialized maintenance.' },
        { term: 'Load Capacity', definition: 'Maximum weight a vehicle can safely carry, including passengers and cargo. Exceeding capacity accelerates wear on suspension, brakes, and drivetrain.' }
      ]
    };

    const learnCategoryMeta = {
      maintenance101: { title: 'Maintenance 101', icon: mccIcon('wrench', 16), desc: 'Understanding routine maintenance' },
      repairs: { title: 'Understanding Repairs', icon: mccIcon('wrench', 16), desc: 'What mechanics mean when they say...' },
      warningSigns: { title: 'Warning Signs', icon: mccIcon('alert-triangle', 16), desc: 'Sounds, smells, and symptoms to watch for' },
      savingTips: { title: 'Money-Saving Tips', icon: mccIcon('dollar-sign', 16), desc: 'How to save on auto care' },
      rideshare: { title: 'Rideshare & High-Mileage Drivers', icon: mccIcon('car', 16), desc: 'Tips for drivers who put serious miles on their vehicles' },
      commercial: { title: 'Commercial & Fleet Vehicles', icon: mccIcon('car', 16), desc: 'Maintenance for vans, buses, and commercial transport' }
    };

    let currentLearnCategory = null;
    let currentGlossaryFilter = '';

    function renderLearnHub() {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
      if (!categoriesContainer || !articlesView) return;
      
      categoriesContainer.style.display = 'grid';
      articlesView.style.display = 'none';
      currentLearnCategory = null;
      
      renderGlossary('');
    }

    function showLearnCategory(category) {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
      if (!categoriesContainer || !articlesView) return;
      
      categoriesContainer.style.display = 'none';
      articlesView.style.display = 'block';
      currentLearnCategory = category;
      
      renderEducationCategory(category);
    }

    function renderEducationCategory(category) {
      const articlesView = document.getElementById('learn-articles-view');
      const articles = carEducation[category] || [];
      const meta = learnCategoryMeta[category];
      
      let html = `
        <div class="learn-back-btn" onclick="renderLearnHub()">← Back to Categories</div>
        <div class="learn-articles-header">
          <h2 class="learn-articles-title">
            <span>${meta.icon}</span> ${meta.title}
          </h2>
          <span style="color:var(--text-muted);font-size:0.88rem;">${articles.length} articles</span>
        </div>
        <p style="color:var(--text-secondary);margin-bottom:20px;">${meta.desc}</p>
      `;
      
      articles.forEach((article, index) => {
        const articleId = `${category}-${index}`;
        const severityBadge = article.severity 
          ? `<span class="learn-severity-badge ${article.severity}">${article.severity}</span>` 
          : '';
        
        html += `
          <div class="learn-article-item" id="article-${articleId}">
            <div class="learn-article-header" onclick="toggleArticle('${articleId}')">
              <span class="learn-article-icon">${article.icon}</span>
              <span class="learn-article-title">${article.title}</span>
              ${article.readTime ? '<span class="learn-article-readtime">' + mccIcon('clock', 12) + ' ' + article.readTime + '</span>' : ''}
              ${severityBadge}
              <span class="learn-article-expand">${mccIcon('chevron-down', 12)}</span>
            </div>
            <div class="learn-article-content">
              <div class="learn-article-text">${article.content}</div>
            </div>
          </div>
        `;
      });
      
      articlesView.innerHTML = html;
    }

    function toggleArticle(articleId) {
      const articleEl = document.getElementById(`article-${articleId}`);
      if (articleEl) {
        articleEl.classList.toggle('expanded');
      }
    }

    function renderGlossary(searchTerm = '') {
      const glossaryList = document.getElementById('glossary-list');
      const alphabetContainer = document.getElementById('glossary-alphabet');
      
      if (!glossaryList || !alphabetContainer) return;
      
      currentGlossaryFilter = searchTerm.toLowerCase();
      
      const filteredTerms = carEducation.glossary.filter(item => 
        item.term.toLowerCase().includes(currentGlossaryFilter) || 
        item.definition.toLowerCase().includes(currentGlossaryFilter)
      );
      
      const usedLetters = new Set(filteredTerms.map(item => item.term[0].toUpperCase()));
      const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      
      alphabetContainer.innerHTML = allLetters.map(letter => {
        const hasTerms = usedLetters.has(letter);
        return `<span class="learn-glossary-letter ${hasTerms ? '' : 'disabled'}" onclick="${hasTerms ? `scrollToGlossaryLetter('${letter}')` : ''}">${letter}</span>`;
      }).join('');
      
      if (filteredTerms.length === 0) {
        glossaryList.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">${mccIcon('search', 40)}</div>
            <p>No terms found matching "${searchTerm}"</p>
          </div>
        `;
        return;
      }
      
      let currentLetter = '';
      let html = '';
      
      filteredTerms.sort((a, b) => a.term.localeCompare(b.term)).forEach(item => {
        const firstLetter = item.term[0].toUpperCase();
        if (firstLetter !== currentLetter) {
          currentLetter = firstLetter;
          html += `<div id="glossary-letter-${firstLetter}" style="font-size:1.2rem;font-weight:700;color:var(--accent-gold);margin-top:16px;margin-bottom:8px;">${firstLetter}</div>`;
        }
        html += `
          <div class="learn-glossary-item">
            <div class="learn-glossary-term">${item.term}</div>
            <div class="learn-glossary-definition">${item.definition}</div>
          </div>
        `;
      });
      
      glossaryList.innerHTML = html;
    }

    function filterGlossary(searchTerm) {
      renderGlossary(searchTerm);
    }

    function scrollToGlossaryLetter(letter) {
      const el = document.getElementById(`glossary-letter-${letter}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    window.showLearnCategory = showLearnCategory;
    window.renderLearnHub = renderLearnHub;
    window.renderGlossary = renderGlossary;
    window.filterGlossary = filterGlossary;
    window.toggleArticle = toggleArticle;
    window.scrollToGlossaryLetter = scrollToGlossaryLetter;
    window.renderEducationCategory = renderEducationCategory;

    const originalShowSection = showSection;
    showSection = async function(sectionId) {
      await originalShowSection(sectionId);
      if (sectionId === 'learn') {
        try { renderLearnHub(); } catch(e) { console.error('Learn hub render error:', e); }
      }
      if (sectionId === 'settings') {
        try { load2FAStatus(); } catch(e) { console.error('2FA status load error:', e); }
      }
    };


    
    let dreamCarSearches = [];
    let dreamCarMatches = [];
    let editingSearchId = null;
    let currentMatchDetail = null;

    async function loadDreamCarSearches() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('dream_car_searches')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        dreamCarSearches = data || [];
        renderDreamCarSearches();
        loadDreamCarMatches();
      } catch (error) {
        console.error('Error loading dream car searches:', error);
      }
    }

    async function loadDreamCarMatches(searchId = null) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        window._lastMarketIntel = null;

        if (searchId) {
          try {
            const { data: searchData } = await supabaseClient
              .from('dream_car_searches')
              .select('market_intel')
              .eq('id', searchId)
              .single();
            if (searchData && searchData.market_intel) {
              window._lastMarketIntel = searchData.market_intel;
            }
          } catch (e) {}
        }

        let query = supabaseClient
          .from('dream_car_matches')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_dismissed', false)
          .order('found_at', { ascending: false })
          .limit(50);

        if (searchId) {
          query = query.eq('search_id', searchId);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        dreamCarMatches = data || [];
        renderDreamCarMatches();
      } catch (error) {
        console.error('Error loading dream car matches:', error);
      }
    }

    function renderDreamCarSearches() {
      const list = document.getElementById('ai-searches-list');
      
      if (dreamCarSearches.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px;">
            <div class="empty-state-icon">${mccIcon('settings', 40)}</div>
            <p>No AI searches yet.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Create a search and we'll automatically find matching cars for you.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = dreamCarSearches.map(search => {
        const statusColor = search.is_active ? 'var(--accent-green)' : 'var(--text-muted)';
        const statusText = search.is_active ? 'Active' : 'Paused';
        const lastSearched = search.last_searched_at ? new Date(search.last_searched_at).toLocaleDateString() : 'Never';
        
        const criteriaParts = [];
        if (search.min_year || search.max_year) {
          criteriaParts.push(`${search.min_year || 'Any'} - ${search.max_year || 'Any'}`);
        }
        if (search.preferred_makes && search.preferred_makes.length > 0) {
          criteriaParts.push(search.preferred_makes.slice(0, 3).join(', '));
        }
        if (search.max_price) {
          criteriaParts.push('$' + Number(search.max_price).toLocaleString() + ' max');
        }
        if (search.max_mileage) {
          criteriaParts.push(Number(search.max_mileage).toLocaleString() + ' mi max');
        }
        
        const matchCount = dreamCarMatches.filter(m => m.search_id === search.id && !m.is_dismissed).length;

        return `
          <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div style="flex: 1; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <h4 style="font-size: 1rem; font-weight: 600;">${escapeHtml(search.search_name || 'Untitled Search')}</h4>
                  <span style="padding: 4px 10px; border-radius: 100px; font-size: 0.75rem; font-weight: 500; background: ${search.is_active ? 'var(--accent-green-soft)' : 'var(--bg-input)'}; color: ${statusColor};">
                    ${statusText}
                  </span>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
                  ${criteriaParts.length > 0 ? criteriaParts.join(' • ') : 'No criteria set'}
                </p>
                <div style="display: flex; gap: 16px; font-size: 0.82rem; color: var(--text-muted);">
                  <span>${mccIcon('calendar', 16)} Last searched: ${lastSearched}</span>
                  <span>${mccIcon('target', 16)} Matches: ${matchCount}</span>
                  <span>${mccIcon('refresh-cw', 16)} ${search.search_frequency === 'hourly' ? 'Every hour' : search.search_frequency === 'twice_daily' ? 'Twice daily' : 'Daily'}</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-primary" onclick="runDreamCarSearchNow('${search.id}')" id="run-btn-${search.id}">
                  ${mccIcon('play', 16)} Run Now
                </button>
                <button class="btn btn-sm btn-secondary" onclick="viewSearchMatches('${search.id}')">
                  ${mccIcon('target', 16)} View Matches
                </button>
                <button class="btn btn-sm btn-secondary" onclick="editDreamCarSearch('${search.id}')">
                  ${mccIcon('file-text', 16)} Edit
                </button>
                <button class="btn btn-sm btn-secondary" onclick="toggleSearchActive('${search.id}')">
                  ${search.is_active ? mccIcon('pause', 14) + ' Pause' : mccIcon('play', 14) + ' Resume'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDreamCarSearch('${search.id}')">
                  ${mccIcon('x', 16)}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderDreamCarMatches() {
      const grid = document.getElementById('ai-matches-grid');
      if (!grid) return;

      if (dreamCarMatches.length === 0 && !window._lastMarketIntel) {
        grid.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px; grid-column: 1 / -1;">
            <div class="empty-state-icon">${mccIcon('car', 40)}</div>
            <p>No matches found yet.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Create an AI search and matches will appear here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(match => {
        const photo = match.photos && match.photos.length > 0 ? match.photos[0] : null;
        const scoreColor = match.match_score >= 90 ? 'var(--accent-green)' : match.match_score >= 70 ? 'var(--accent-gold)' : 'var(--accent-blue)';
        
        return `
          <div class="vehicle-card" style="cursor: pointer;" onclick="viewMatchDetail('${match.id}')">
            <div class="vehicle-card-photo">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" onerror="this.parentNode.innerHTML='<div class=\\'vehicle-emoji\\'>' + mccIcon('car', 16) + '</div>'">` : '<div class="vehicle-emoji">' + mccIcon('car', 16) + '</div>'}
              <div style="position: absolute; top: 12px; right: 12px; padding: 6px 12px; border-radius: 100px; font-size: 0.8rem; font-weight: 600; background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}88); color: white;">
                ${match.match_score || 0}% Match
              </div>
              ${!match.is_seen ? '<div style="position: absolute; top: 12px; left: 12px; width: 10px; height: 10px; background: var(--accent-blue); border-radius: 50%;"></div>' : ''}
            </div>
            <div class="vehicle-card-body">
              <h3 class="vehicle-card-title">${match.year || ''} ${escapeHtml(match.make || '')} ${escapeHtml(match.model || '')}</h3>
              <p class="vehicle-card-subtitle">${match.trim ? escapeHtml(match.trim) : ''}</p>
              <div class="vehicle-card-meta">
                ${match.price ? `<span>${mccIcon('dollar-sign', 16)} $${Number(match.price).toLocaleString()}</span>` : ''}
                ${match.mileage ? `<span>${mccIcon('car', 16)} ${Number(match.mileage).toLocaleString()} mi</span>` : ''}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                ${match.location ? `<span>${mccIcon('map-pin', 16)} ${escapeHtml(match.location)}</span>` : ''}
                ${match.source ? `<span>${mccIcon('link', 16)} ${escapeHtml(match.source)}</span>` : ''}
              </div>
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm ${match.is_seen ? 'btn-ghost' : 'btn-secondary'}" onclick="markMatchSeen('${match.id}', ${!match.is_seen})">
                  ${match.is_seen ? mccIcon('eye', 16) + ' Seen' : mccIcon('eye', 16) + ' Mark Seen'}
                </button>
                <button class="btn btn-sm ${match.is_saved ? 'btn-primary' : 'btn-secondary'}" onclick="saveMatch('${match.id}', ${!match.is_saved})">
                  ${match.is_saved ? mccIcon('star', 16) + ' Saved' : mccIcon('star', 16) + ' Save'}
                </button>
                <button class="btn btn-sm btn-ghost" onclick="dismissMatch('${match.id}')" title="Dismiss">
                  ${mccIcon('x', 16)}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderDreamCarMarketIntel(intel, criteriaLabel, pr) {
      let checklistHtml = '';
      if (intel.buyingChecklist && intel.buyingChecklist.length > 0) {
        checklistHtml = `
          <div style="margin-bottom: 24px;">
            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 12px;">${mccIcon('clipboard-check', 16)} Buying Checklist for ${escapeHtml(criteriaLabel)}</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${intel.buyingChecklist.map((tip, i) => `
                <div style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; background: var(--bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  <span style="flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-gold); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">${i + 1}</span>
                  <span style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(tip)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      let searchButtonsHtml = '';
      if (intel.searchUrls) {
        searchButtonsHtml = `
          <div style="margin-bottom: 24px;">
            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 12px;">${mccIcon('external-link', 16)} Search Live Inventory</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
              <a href="${escapeHtml(intel.searchUrls.autotrader)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; font-weight: 600; text-decoration: none;">
                ${mccIcon('search', 16)} Autotrader
              </a>
              <a href="${escapeHtml(intel.searchUrls.cargurus)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; font-weight: 600; text-decoration: none;">
                ${mccIcon('search', 16)} CarGurus
              </a>
              <a href="${escapeHtml(intel.searchUrls.cars_com)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; font-weight: 600; text-decoration: none;">
                ${mccIcon('search', 16)} Cars.com
              </a>
            </div>
          </div>
        `;
      }

      let saveProspectHtml = '';
      if (intel.searchCriteria?.make) {
        const sc = intel.searchCriteria;
        window._pendingProspect = { make: sc.make, model: sc.model || '', year: sc.maxYear || sc.minYear || '', price: sc.maxPrice || pr.median || '' };
        saveProspectHtml = `
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 20px;">
            <button class="btn btn-primary" onclick="saveMarketIntelAsProspect(window._pendingProspect)" style="width: 100%; padding: 14px; font-weight: 600; border-radius: 100px;">
              ${mccIcon('plus', 16)} Save as Prospect in My Next Car
            </button>
          </div>
        `;
      }

      return `
        <div style="padding: 4px 0;">
          ${priceGaugeHtml}
          ${checklistHtml}
          ${searchButtonsHtml}
          ${saveProspectHtml}
        </div>
      `;
    }

    function filterAIMatches() {
      renderDreamCarMatches();
    }

    async function loadDreamCarFinderSection() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // Load searches
        const { data: searches, error: searchError } = await supabaseClient
          .from('dream_car_searches')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (searchError) throw searchError;
        dreamCarSearches = searches || [];

        // Load all matches (not filtered by search)
        const { data: matches, error: matchError } = await supabaseClient
          .from('dream_car_matches')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_dismissed', false)
          .order('found_at', { ascending: false })
          .limit(50);

        if (matchError) throw matchError;
        dreamCarMatches = matches || [];

        renderDreamCarFinderSearches();
        renderDreamCarFinderMatches();
      } catch (error) {
        console.error('Error loading Dream Car Finder section:', error);
      }
    }

    function renderDreamCarFinderSearches() {
      const list = document.getElementById('dream-car-searches-list');
      if (!list) return;
      
      if (dreamCarSearches.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px;">
            <div class="empty-state-icon">${mccIcon('car', 40)}</div>
            <p style="margin-bottom: 16px;">No AI searches configured yet.</p>
            <button class="btn btn-primary" onclick="openAISearchModal()">Create Your First Search</button>
          </div>
        `;
        return;
      }

      list.innerHTML = dreamCarSearches.map(search => {
        const statusColor = search.is_active ? 'var(--accent-green)' : 'var(--text-muted)';
        const statusText = search.is_active ? 'Active' : 'Paused';
        const lastSearched = search.last_searched_at ? new Date(search.last_searched_at).toLocaleDateString() : 'Never';
        
        const criteriaParts = [];
        if (search.min_year || search.max_year) criteriaParts.push(`${search.min_year || 'Any'} - ${search.max_year || 'Any'}`);
        if (search.preferred_makes?.length) criteriaParts.push(search.preferred_makes.join(', '));
        if (search.body_styles?.length) criteriaParts.push(search.body_styles.join(', '));
        if (search.min_price || search.max_price) criteriaParts.push(`$${(search.min_price || 0).toLocaleString()} - $${(search.max_price || '∞').toLocaleString()}`);

        return `
          <div class="card" style="margin-bottom: 12px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div style="flex: 1; min-width: 200px;">
                <h4 style="margin: 0 0 8px;">${escapeHtml(search.search_name || 'Unnamed Search')}</h4>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 8px;">${criteriaParts.join(' • ') || 'No criteria set'}</p>
                <div style="display: flex; gap: 12px; font-size: 0.8rem;">
                  <span style="color: ${statusColor};">● ${statusText}</span>
                  <span style="color: var(--text-muted);">Last searched: ${lastSearched}</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary" onclick="openAISearchModal('${search.id}')">${mccIcon('file-text', 16)} Edit</button>
                <button class="btn btn-sm btn-ghost" onclick="deleteAISearch('${search.id}')">${mccIcon('x', 16)}</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const countBadge = document.getElementById('dream-car-count');
      if (countBadge) {
        const activeCount = dreamCarSearches.filter(s => s.is_active).length;
        if (activeCount > 0) {
          countBadge.textContent = activeCount;
          countBadge.style.display = 'inline-flex';
        } else {
          countBadge.style.display = 'none';
        }
      }
    }

    function renderDreamCarFinderMatches() {
      const list = document.getElementById('dream-car-matches-list');
      if (!list) return;
      
      if (dreamCarMatches.length === 0 && !window._lastMarketIntel) {
        list.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px;">
            <div class="empty-state-icon">${mccIcon('mail', 40)}</div>
            <p>No matches yet. Create a search to start finding vehicles!</p>
          </div>
        `;
        return;
      }

      const matchesBadge = document.getElementById('dream-matches-badge');
      if (matchesBadge) matchesBadge.style.display = 'none';

      list.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
          ${dreamCarMatches.slice(0, 12).map(match => {
            const photo = match.photos && match.photos.length > 0 ? match.photos[0] : null;
            const scoreColor = match.match_score >= 90 ? 'var(--accent-green)' : match.match_score >= 70 ? 'var(--accent-gold)' : 'var(--accent-blue)';
            
            return `
              <div class="card" style="cursor: pointer; overflow: hidden;" onclick="viewMatchDetail('${match.id}')">
                <div style="height: 140px; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; position: relative;">
                  ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextSibling.style.display='flex';">` : ''}
                  <div style="font-size: 3rem; ${photo ? 'display: none;' : ''}">${mccIcon('car', 40)}</div>
                  <div style="position: absolute; top: 8px; right: 8px; padding: 4px 10px; border-radius: 100px; font-size: 0.75rem; font-weight: 600; background: ${scoreColor}; color: white;">
                    ${match.match_score || 0}%
                  </div>
                  ${!match.is_seen ? '<div style="position: absolute; top: 8px; left: 8px; width: 8px; height: 8px; background: var(--accent-blue); border-radius: 50%;"></div>' : ''}
                </div>
                <div style="padding: 12px;">
                  <h4 style="margin: 0 0 4px; font-size: 0.95rem;">${match.year || ''} ${escapeHtml(match.make || '')} ${escapeHtml(match.model || '')}</h4>
                  <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 8px;">${match.trim ? escapeHtml(match.trim) : ''}</p>
                  <div style="display: flex; gap: 12px; font-size: 0.85rem; color: var(--text-secondary);">
                    ${match.price ? `<span>$${Number(match.price).toLocaleString()}</span>` : ''}
                    ${match.mileage ? `<span>${Number(match.mileage).toLocaleString()} mi</span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${dreamCarMatches.length > 12 ? `<p style="text-align: center; margin-top: 16px; color: var(--text-muted);">Showing 12 of ${dreamCarMatches.length} matches. <a href="#" onclick="showSection('my-next-car'); showProspectTab('ai-search'); return false;" style="color: var(--accent-gold);">View all →</a></p>` : ''}
      `;
    }

    window.loadDreamCarFinderSection = loadDreamCarFinderSection;

    window.showProspectTab = function(tabName) {
      document.querySelectorAll('.prospect-tab-content').forEach(t => t.style.display = 'none');
      document.querySelectorAll('[data-prospect-tab]').forEach(t => t.classList.remove('active'));
      const tabEl = document.getElementById(tabName + '-tab');
      if (tabEl) tabEl.style.display = 'block';
      const tabBtn = document.querySelector(`[data-prospect-tab="${tabName}"]`);
      if (tabBtn) tabBtn.classList.add('active');
    };

    function viewSearchMatches(searchId) {
      loadDreamCarMatches(searchId);
    }

    async function runDreamCarSearchNow(searchId) {
      const btn = document.getElementById('run-btn-' + searchId);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = mccIcon('loader', 16) + ' Searching...';
      }
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { showToast('Please log in', 'error'); return; }

        const resp = await fetch('/api/dream-car/run-search/' + searchId, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
          }
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Search failed');

        if (result.marketIntel) {
          window._lastMarketIntel = result.marketIntel;
        }

        showToast(result.message || 'Search complete!', 'success');
        await loadDreamCarMatches(searchId);
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error running search:', error);
        showToast('Search failed: ' + error.message, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('play', 16) + ' Run Now';
        }
      }
    }

    async function saveMarketIntelAsProspect(prospectData) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { showToast('Please log in', 'error'); return; }

        const data = typeof prospectData === 'string' ? JSON.parse(prospectData) : prospectData;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .insert([{
            user_id: session.user.id,
            make: data.make || '',
            model: data.model || '',
            year: data.year ? Number.parseInt(data.year) : null,
            max_price: data.price ? Number.parseFloat(data.price) : null,
            status: 'considering',
            notes: 'Saved from Dream Car Finder market intelligence'
          }]);

        if (error) throw error;
        showToast('Saved as prospect in My Next Car!', 'success');
      } catch (error) {
        console.error('Error saving prospect:', error);
        showToast('Failed to save prospect. Please try again.', 'error');
      }
    }

    function toggleAISearchEmailInput() {
      const checkbox = document.getElementById('ai-search-notify-email');
      const field = document.getElementById('ai-search-email-field');
      if (field) {
        field.style.display = checkbox.checked ? 'block' : 'none';
      }
    }

    function toggleAISearchSmsInput() {
      const checkbox = document.getElementById('ai-search-notify-sms');
      const field = document.getElementById('ai-search-sms-field');
      if (field) {
        field.style.display = checkbox.checked ? 'block' : 'none';
      }
    }

    async function openAISearchModal(searchId = null) {
      editingSearchId = searchId;
      const modal = document.getElementById('ai-search-modal');
      const titleEl = document.getElementById('ai-search-modal-title');
      const form = document.getElementById('ai-search-form');
      
      form.reset();
      document.getElementById('ai-search-id').value = '';
      
      document.querySelectorAll('input[name="ai-body-style"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-fuel-type"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-make"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-color"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-feature"]').forEach(cb => cb.checked = false);
      document.getElementById('ai-search-notify-email').checked = true;
      document.getElementById('ai-search-notify-sms').checked = false;
      document.getElementById('ai-search-active').checked = true;
      document.getElementById('ai-search-email-report-frequency').value = 'daily';
      document.getElementById('ai-search-radius').value = '50';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
          const emailInput = document.getElementById('ai-search-email');
          if (emailInput) emailInput.value = session.user.email || '';
          
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('phone')
            .eq('id', session.user.id)
            .single();
          if (profile && profile.phone) {
            const phoneInput = document.getElementById('ai-search-phone');
            if (phoneInput) phoneInput.value = profile.phone;
          }
        }
      } catch (e) {
        console.log('Could not pre-fill user contact info');
      }

      toggleAISearchEmailInput();
      toggleAISearchSmsInput();
      
      if (searchId) {
        titleEl.textContent = 'Edit AI Search';
        const search = dreamCarSearches.find(s => s.id === searchId);
        if (search) {
          document.getElementById('ai-search-id').value = search.id;
          document.getElementById('ai-search-name').value = search.search_name || '';
          document.getElementById('ai-search-min-year').value = search.min_year || '';
          document.getElementById('ai-search-max-year').value = search.max_year || '';
          document.getElementById('ai-search-min-price').value = search.min_price || '';
          document.getElementById('ai-search-max-price').value = search.max_price || '';
          document.getElementById('ai-search-min-mileage').value = search.min_mileage || '';
          document.getElementById('ai-search-max-mileage').value = search.max_mileage || '';
          document.getElementById('ai-search-models').value = (search.preferred_models || []).join(', ');
          document.getElementById('ai-search-trims').value = (search.preferred_trims || []).join(', ');
          document.getElementById('ai-search-zip').value = search.zip_code || '';
          document.getElementById('ai-search-radius').value = search.max_distance_miles || '50';
          document.getElementById('ai-search-frequency').value = search.search_frequency || 'daily';
          document.getElementById('ai-search-email-report-frequency').value = search.email_report_frequency || 'daily';
          document.getElementById('ai-search-notify-email').checked = search.notify_email !== false;
          document.getElementById('ai-search-notify-sms').checked = search.notify_sms === true;
          document.getElementById('ai-search-active').checked = search.is_active !== false;

          if (search.notification_email) {
            const emailInput = document.getElementById('ai-search-email');
            if (emailInput) emailInput.value = search.notification_email;
          }
          if (search.notification_phone) {
            const phoneInput = document.getElementById('ai-search-phone');
            if (phoneInput) phoneInput.value = search.notification_phone;
          }

          toggleAISearchEmailInput();
          toggleAISearchSmsInput();

          (search.preferred_makes || []).forEach(make => {
            const cb = document.querySelector(`input[name="ai-make"][value="${make}"]`);
            if (cb) cb.checked = true;
          });

          (search.exterior_colors || []).forEach(color => {
            const cb = document.querySelector(`input[name="ai-color"][value="${color}"]`);
            if (cb) cb.checked = true;
          });

          (search.must_have_features || []).forEach(feature => {
            const cb = document.querySelector(`input[name="ai-feature"][value="${feature}"]`);
            if (cb) cb.checked = true;
          });
          
          (search.body_styles || []).forEach(style => {
            const cb = document.querySelector(`input[name="ai-body-style"][value="${style}"]`);
            if (cb) cb.checked = true;
          });
          
          (search.fuel_types || []).forEach(type => {
            const cb = document.querySelector(`input[name="ai-fuel-type"][value="${type}"]`);
            if (cb) cb.checked = true;
          });
        }
      } else {
        titleEl.textContent = 'Create AI Search';
      }
      
      modal.classList.add('active');
    }

    function closeAISearchModal() {
      document.getElementById('ai-search-modal').classList.remove('active');
      editingSearchId = null;
    }

    function editDreamCarSearch(searchId) {
      openAISearchModal(searchId);
    }

    async function saveAISearch(event) {
      event.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save search', 'error');
          return;
        }

        const bodyStyles = Array.from(document.querySelectorAll('input[name="ai-body-style"]:checked')).map(cb => cb.value);
        const fuelTypes = Array.from(document.querySelectorAll('input[name="ai-fuel-type"]:checked')).map(cb => cb.value);
        const preferredMakes = Array.from(document.querySelectorAll('input[name="ai-make"]:checked')).map(cb => cb.value);
        const exteriorColors = Array.from(document.querySelectorAll('input[name="ai-color"]:checked')).map(cb => cb.value);
        const mustHaveFeatures = Array.from(document.querySelectorAll('input[name="ai-feature"]:checked')).map(cb => cb.value);
        
        const searchData = {
          user_id: session.user.id,
          search_name: document.getElementById('ai-search-name').value.trim(),
          min_year: Number.parseInt(document.getElementById('ai-search-min-year').value) || null,
          max_year: Number.parseInt(document.getElementById('ai-search-max-year').value) || null,
          min_price: Number.parseFloat(document.getElementById('ai-search-min-price').value) || null,
          max_price: Number.parseFloat(document.getElementById('ai-search-max-price').value) || null,
          min_mileage: Number.parseInt(document.getElementById('ai-search-min-mileage').value) || null,
          max_mileage: Number.parseInt(document.getElementById('ai-search-max-mileage').value) || null,
          preferred_makes: preferredMakes,
          preferred_models: document.getElementById('ai-search-models').value.split(',').map(s => s.trim()).filter(s => s),
          preferred_trims: document.getElementById('ai-search-trims').value.split(',').map(s => s.trim()).filter(s => s),
          body_styles: bodyStyles,
          fuel_types: fuelTypes,
          zip_code: document.getElementById('ai-search-zip').value.trim() || null,
          max_distance_miles: Number.parseInt(document.getElementById('ai-search-radius').value) || null,
          exterior_colors: exteriorColors,
          must_have_features: mustHaveFeatures,
          search_frequency: document.getElementById('ai-search-frequency').value,
          email_report_frequency: document.getElementById('ai-search-email-report-frequency').value,
          notify_email: document.getElementById('ai-search-notify-email').checked,
          notify_sms: document.getElementById('ai-search-notify-sms').checked,
          notification_email: document.getElementById('ai-search-email').value.trim() || null,
          notification_phone: document.getElementById('ai-search-phone').value.trim() || null,
          is_active: document.getElementById('ai-search-active').checked
        };

        const existingId = document.getElementById('ai-search-id').value;
        
        if (existingId) {
          const { error } = await supabaseClient
            .from('dream_car_searches')
            .update(searchData)
            .eq('id', existingId);
          
          if (error) throw error;
          showToast('Search updated successfully!', 'success');
        } else {
          const { error } = await supabaseClient
            .from('dream_car_searches')
            .insert([searchData]);
          
          if (error) throw error;
          showToast('Search created successfully!', 'success');
        }
        
        closeAISearchModal();
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error saving AI search:', error);
        showToast('Failed to save search. Please try again.', 'error');
      }
    }

    async function deleteDreamCarSearch(searchId) {
      if (!confirm('Are you sure you want to delete this search? All matches will also be deleted.')) return;
      
      try {
        const { error } = await supabaseClient
          .from('dream_car_searches')
          .delete()
          .eq('id', searchId);
        
        if (error) throw error;
        
        showToast('Search deleted successfully!', 'success');
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error deleting search:', error);
        showToast('Failed to delete search. Please try again.', 'error');
      }
    }

    async function toggleSearchActive(searchId) {
      try {
        const search = dreamCarSearches.find(s => s.id === searchId);
        if (!search) return;
        
        const { error } = await supabaseClient
          .from('dream_car_searches')
          .update({ is_active: !search.is_active })
          .eq('id', searchId);
        
        if (error) throw error;
        
        showToast(search.is_active ? 'Search paused' : 'Search resumed', 'success');
        loadDreamCarSearches();
      } catch (error) {
        console.error('Error toggling search:', error);
        showToast('Failed to update search. Please try again.', 'error');
      }
    }

    async function markMatchSeen(matchId, seen = true) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_seen: seen })
          .eq('id', matchId);
        
        if (error) throw error;
        
        const match = dreamCarMatches.find(m => m.id === matchId);
        if (match) match.is_seen = seen;
        renderDreamCarMatches();
      } catch (error) {
        console.error('Error marking match:', error);
      }
    }

    async function saveMatch(matchId, save = true) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_saved: save })
          .eq('id', matchId);
        
        if (error) throw error;
        
        const match = dreamCarMatches.find(m => m.id === matchId);
        if (match) match.is_saved = save;
        renderDreamCarMatches();
        showToast(save ? 'Match saved!' : 'Match unsaved', 'success');
      } catch (error) {
        console.error('Error saving match:', error);
      }
    }

    async function dismissMatch(matchId) {
      try {
        const { error } = await supabaseClient
          .from('dream_car_matches')
          .update({ is_dismissed: true })
          .eq('id', matchId);
        
        if (error) throw error;
        
        dreamCarMatches = dreamCarMatches.filter(m => m.id !== matchId);
        renderDreamCarMatches();
        showToast('Match dismissed', 'success');
      } catch (error) {
        console.error('Error dismissing match:', error);
      }
    }

    function viewMatchDetail(matchId) {
      const match = dreamCarMatches.find(m => m.id === matchId);
      if (!match) return;
      
      currentMatchDetail = match;
      markMatchSeen(matchId, true);
      
      const modal = document.getElementById('ai-match-detail-modal');
      const titleEl = document.getElementById('ai-match-modal-title');
      const bodyEl = document.getElementById('ai-match-modal-body');
      
      titleEl.textContent = `${match.year || ''} ${match.make || ''} ${match.model || ''}`.trim();
      
      const photo = match.photos && match.photos.length > 0 ? match.photos[0] : null;
      const scoreColor = match.match_score >= 90 ? 'var(--accent-green)' : match.match_score >= 70 ? 'var(--accent-gold)' : 'var(--accent-blue)';
      
      bodyEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <div style="height: 200px; background: var(--bg-input); border-radius: var(--radius-md); overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentNode.innerHTML='<div style=\\'font-size: 60px;\\'>' + mccIcon('car', 16) + '</div>'">` : '<div style="font-size: 60px;">' + mccIcon('car', 16) + '</div>'}
            </div>
            ${match.photos && match.photos.length > 1 ? `
              <div style="display: flex; gap: 8px; overflow-x: auto;">
                ${match.photos.slice(1, 5).map(p => `
                  <img src="${escapeHtml(p)}" alt="Photo" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer;" onerror="this.style.display='none'">
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <div style="padding: 8px 16px; border-radius: 100px; font-size: 1rem; font-weight: 600; background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}88); color: white;">
                ${match.match_score || 0}% Match
              </div>
              ${match.is_saved ? '<span style="color: var(--accent-gold);">' + mccIcon('star', 16) + ' Saved</span>' : ''}
            </div>
            <div style="display: grid; gap: 12px;">
              ${match.price ? `<div><span style="color: var(--text-muted);">Price:</span> <strong>$${Number(match.price).toLocaleString()}</strong></div>` : ''}
              ${match.mileage ? `<div><span style="color: var(--text-muted);">Mileage:</span> <strong>${Number(match.mileage).toLocaleString()} miles</strong></div>` : ''}
              ${match.exterior_color ? `<div><span style="color: var(--text-muted);">Color:</span> ${escapeHtml(match.exterior_color)}</div>` : ''}
              ${match.location ? `<div><span style="color: var(--text-muted);">Location:</span> ${escapeHtml(match.location)}</div>` : ''}
              ${match.seller_type ? `<div><span style="color: var(--text-muted);">Seller:</span> ${match.seller_type === 'dealer' ? 'Dealer' : match.seller_type === 'private' ? 'Private' : 'Other'}</div>` : ''}
              ${match.source ? `<div><span style="color: var(--text-muted);">Source:</span> ${escapeHtml(match.source)}</div>` : ''}
            </div>
            ${match.listing_url ? `
              <a href="${escapeHtml(match.listing_url)}" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-top: 16px; width: 100%; justify-content: center;">
                ${mccIcon('link', 16)} View Original Listing
              </a>
            ` : ''}
          </div>
        </div>
        ${match.match_reasons && match.match_reasons.length > 0 ? `
          <div style="margin-top: 20px; padding: 16px; background: var(--bg-input); border-radius: var(--radius-md);">
            <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--accent-gold);">Why this matches:</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${match.match_reasons.map(r => `<span style="padding: 4px 10px; background: var(--accent-gold-soft); color: var(--accent-gold); border-radius: 100px; font-size: 0.82rem;">${mccIcon('check', 16)} ${escapeHtml(r)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      `;
      
      modal.classList.add('active');
    }

    function closeAIMatchModal() {
      document.getElementById('ai-match-detail-modal').classList.remove('active');
      currentMatchDetail = null;
    }

    async function addMatchToProspects() {
      if (!currentMatchDetail) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in', 'error');
          return;
        }

        const prospectData = {
          user_id: session.user.id,
          year: Number.parseInt(currentMatchDetail.year) || null,
          make: currentMatchDetail.make,
          model: currentMatchDetail.model,
          trim: currentMatchDetail.trim,
          asking_price: currentMatchDetail.price,
          mileage: currentMatchDetail.mileage,
          exterior_color: currentMatchDetail.exterior_color,
          seller_location: currentMatchDetail.location,
          seller_type: currentMatchDetail.seller_type,
          listing_url: currentMatchDetail.listing_url,
          photos: currentMatchDetail.photos || [],
          status: 'considering'
        };

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .insert([prospectData]);

        if (error) throw error;

        showToast('Added to prospects!', 'success');
        closeAIMatchModal();
        loadProspectVehicles();
      } catch (error) {
        console.error('Error adding to prospects:', error);
        showToast('Failed to add to prospects', 'error');
      }
    }

    async function loadProspectVehicles() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('prospect_vehicles')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        prospectVehicles = data || [];
        renderProspects();
        updateProspectCount();
      } catch (error) {
        console.error('Error loading prospects:', error);
      }
    }

    function updateProspectCount() {
      const countEl = document.getElementById('prospect-count');
      const activeCount = prospectVehicles.filter(p => p.status === 'considering' || p.status === 'test_driven').length;
      if (activeCount > 0) {
        countEl.textContent = activeCount;
        countEl.style.display = 'inline-block';
      } else {
        countEl.style.display = 'none';
      }
    }

    function renderProspects() {
      const grid = document.getElementById('prospects-grid');
      const filter = document.getElementById('prospect-filter').value;
      
      let filtered = prospectVehicles;
      if (filter !== 'all') {
        filtered = prospectVehicles.filter(p => p.status === filter);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${mccIcon('car-front', 40)}</div>
            <p>No prospect vehicles ${filter !== 'all' ? 'with this status' : 'yet'}.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Add vehicles you're considering to compare them.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const matchScore = calculateMatchScore(p);
        const statusColors = {
          considering: 'var(--accent-blue)',
          test_driven: 'var(--accent-orange)',
          offer_made: '#a855f7',
          purchased: 'var(--accent-green)',
          passed: 'var(--text-muted)'
        };
        const statusLabels = {
          considering: 'Considering',
          test_driven: 'Test Driven',
          offer_made: 'Offer Made',
          purchased: 'Purchased',
          passed: 'Passed'
        };
        
        return `
          <div class="vehicle-card" style="cursor: pointer;" onclick="viewProspect('${p.id}')">
            <div class="vehicle-card-photo">
              <div class="vehicle-emoji">${mccIcon('car-front', 16)}</div>
              ${p.is_favorite ? '<div style="position:absolute;top:12px;left:12px;font-size:24px;">' + mccIcon('heart', 24) + '</div>' : ''}
              <div class="vehicle-card-badge" style="background:${statusColors[p.status] || statusColors.considering};color:${p.status === 'passed' ? 'var(--text-primary)' : '#fff'};">${statusLabels[p.status] || 'Considering'}</div>
            </div>
            <div class="vehicle-card-body">
              <div class="vehicle-card-title">${p.year || ''} ${p.make || ''} ${p.model || ''}</div>
              <div class="vehicle-card-subtitle">${p.trim || ''} ${p.body_style ? '• ' + p.body_style : ''}</div>
              <div class="vehicle-card-meta">
                ${p.mileage ? `<span>${mccIcon('car', 16)} ${Number(p.mileage).toLocaleString()} mi</span>` : ''}
                ${p.asking_price ? `<span>${mccIcon('dollar-sign', 16)} $${Number(p.asking_price).toLocaleString()}</span>` : ''}
                ${p.carfax_accidents !== null ? `<span>${mccIcon('alert-triangle', 16)} ${p.carfax_accidents} accidents</span>` : ''}
              </div>
              ${matchScore !== null ? `
                <div style="margin-top:12px;padding:8px 12px;background:${matchScore >= 80 ? 'var(--accent-green-soft)' : matchScore >= 50 ? 'var(--accent-orange-soft)' : 'rgba(239,95,95,0.15)'};border-radius:var(--radius-sm);display:inline-flex;align-items:center;gap:6px;">
                  <span style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}% Match</span>
                </div>
              ` : ''}
              ${p.personal_rating ? `
                <div style="margin-top:8px;color:var(--accent-gold);">
                  ${mccIcon('star', 16).repeat(p.personal_rating)}${mccIcon('star', 16).repeat(5 - p.personal_rating)}
                </div>
              ` : ''}
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm btn-secondary" onclick="editProspect('${p.id}')">${mccIcon('file-text', 16)} Edit</button>
                <button class="btn btn-sm btn-ghost" onclick="toggleFavorite('${p.id}')" title="${p.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">${p.is_favorite ? mccIcon('heart', 16) : mccIcon('heart', 16)}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProspect('${p.id}')">${mccIcon('x', 16)}</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterProspects() {
      renderProspects();
    }

    function inspectThisCar(id) {
      const prospect = prospectVehicles.find(p => p.id === id);
      if (!prospect) return;
      const label = [prospect.year, prospect.make, prospect.model].filter(Boolean).join(' ');
      if (typeof openPackageModal === 'function') {
        openPackageModal();
        setTimeout(() => {
          const titleField = document.getElementById('p-title');
          const categorySelect = document.getElementById('p-category');
          if (titleField) titleField.value = `Pre-Purchase Inspection — ${label}`;
          if (categorySelect) {
            categorySelect.value = 'maintenance';
            categorySelect.dispatchEvent(new Event('change'));
          }
        }, 200);
      } else {
        showToast('Open the Packages tab to create a service request.', 'info');
      }
    }

    function calculateMatchScore(prospect) {
      if (!memberCarPreferences) return null;
      
      let score = 0;
      let factors = 0;

      if (memberCarPreferences.min_budget && memberCarPreferences.max_budget && prospect.asking_price) {
        factors++;
        if (prospect.asking_price >= memberCarPreferences.min_budget && prospect.asking_price <= memberCarPreferences.max_budget) {
          score += 100;
        } else if (prospect.asking_price < memberCarPreferences.min_budget) {
          score += 80;
        } else {
          const overBudget = prospect.asking_price - memberCarPreferences.max_budget;
          const percentage = (overBudget / memberCarPreferences.max_budget) * 100;
          score += Math.max(0, 100 - percentage * 2);
        }
      }

      if (memberCarPreferences.min_year && prospect.year) {
        factors++;
        score += prospect.year >= memberCarPreferences.min_year ? 100 : 50;
      }

      if (memberCarPreferences.max_mileage && prospect.mileage) {
        factors++;
        if (prospect.mileage <= memberCarPreferences.max_mileage) {
          score += 100;
        } else {
          const overMileage = prospect.mileage - memberCarPreferences.max_mileage;
          const percentage = (overMileage / memberCarPreferences.max_mileage) * 100;
          score += Math.max(0, 100 - percentage);
        }
      }

      if (memberCarPreferences.preferred_makes && memberCarPreferences.preferred_makes.length > 0 && prospect.make) {
        factors++;
        if (memberCarPreferences.preferred_makes.some(m => m.toLowerCase() === prospect.make.toLowerCase())) {
          score += 100;
        } else {
          score += 30;
        }
      }

      if (memberCarPreferences.fuel_preference && prospect.fuel_type) {
        factors++;
        score += memberCarPreferences.fuel_preference === prospect.fuel_type ? 100 : 50;
      }

      if (factors === 0) return null;
      return Math.round(score / factors);
    }

    function openAddProspectModal() {
      editingProspectId = null;
      document.getElementById('add-prospect-form').reset();
      selectedProspectRating = 0;
      updateRatingStars();
      document.getElementById('add-prospect-modal').style.display = 'flex';
    }

    function closeAddProspectModal() {
      document.getElementById('add-prospect-modal').style.display = 'none';
      editingProspectId = null;
    }

    function setProspectRating(rating) {
      selectedProspectRating = rating;
      document.getElementById('prospect-rating').value = rating;
      updateRatingStars();
    }

    function updateRatingStars() {
      document.querySelectorAll('#prospect-rating-stars .rating-star').forEach(star => {
        const r = Number.parseInt(star.dataset.rating);
        star.style.opacity = r <= selectedProspectRating ? '1' : '0.3';
      });
    }

    async function lookupProspectVIN() {
      const vin = document.getElementById('prospect-vin-lookup').value.trim().toUpperCase();
      if (!vin || vin.length !== 17) {
        showToast('Please enter a valid 17-character VIN', 'error');
        return;
      }

      const btn = document.getElementById('vin-lookup-btn');
      btn.disabled = true;
      btn.innerHTML = mccIcon('clock', 16) + ' Looking up...';

      try {
        const response = await fetch(`/api/vin-proxy?vin=${encodeURIComponent(vin)}`);
        if (!response.ok) {
          showToast('VIN lookup failed. Please try again.', 'error');
          return;
        }
        const data = await response.json();
        
        if (data.Results) {
          const getValue = (varName) => {
            const item = data.Results.find(r => r.Variable === varName);
            return item && item.Value && item.Value !== 'Not Applicable' ? item.Value : '';
          };

          document.getElementById('prospect-year').value = getValue('Model Year');
          document.getElementById('prospect-make').value = getValue('Make');
          document.getElementById('prospect-model').value = getValue('Model');
          document.getElementById('prospect-trim').value = getValue('Trim');
          document.getElementById('prospect-body-style').value = getValue('Body Class') || '';
          
          const displacement = getValue('Displacement (L)');
          const cylinders = getValue('Engine Number of Cylinders');
          const engineConfig = getValue('Engine Configuration');
          let engine = '';
          if (displacement) engine += displacement + 'L ';
          if (cylinders) engine += cylinders + '-cyl ';
          if (engineConfig) engine += engineConfig;
          document.getElementById('prospect-engine').value = engine.trim();
          
          const fuelType = getValue('Fuel Type - Primary');
          if (fuelType) {
            const fuelSelect = document.getElementById('prospect-fuel-type');
            for (let opt of fuelSelect.options) {
              if (fuelType.toLowerCase().includes(opt.value.toLowerCase())) {
                fuelSelect.value = opt.value;
                break;
              }
            }
          }
          
          document.getElementById('prospect-vin').value = vin;
          
          showToast('Vehicle specs loaded from VIN!', 'success');
        }
      } catch (error) {
        console.error('VIN lookup error:', error);
        showToast('Failed to lookup VIN. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = mccIcon('search', 16) + ' Lookup';
      }
    }

    async function saveProspectVehicle(e) {
      e.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save vehicles', 'error');
          return;
        }

        const prospectData = {
          user_id: session.user.id,
          vin: document.getElementById('prospect-vin').value.trim().toUpperCase() || null,
          year: Number.parseInt(document.getElementById('prospect-year').value) || null,
          make: document.getElementById('prospect-make').value.trim() || null,
          model: document.getElementById('prospect-model').value.trim() || null,
          trim: document.getElementById('prospect-trim').value.trim() || null,
          body_style: document.getElementById('prospect-body-style').value || null,
          engine: document.getElementById('prospect-engine').value.trim() || null,
          fuel_type: document.getElementById('prospect-fuel-type').value || null,
          mileage: Number.parseInt(document.getElementById('prospect-mileage').value) || null,
          asking_price: Number.parseFloat(document.getElementById('prospect-price').value) || null,
          exterior_color: document.getElementById('prospect-ext-color').value.trim() || null,
          interior_color: document.getElementById('prospect-int-color').value.trim() || null,
          seller_type: document.getElementById('prospect-seller-type').value || null,
          seller_name: document.getElementById('prospect-seller-name').value.trim() || null,
          seller_location: document.getElementById('prospect-location').value.trim() || null,
          listing_url: document.getElementById('prospect-listing-url').value.trim() || null,
          carfax_accidents: Number.parseInt(document.getElementById('prospect-accidents').value) || 0,
          carfax_owners: Number.parseInt(document.getElementById('prospect-owners').value) || null,
          carfax_service_records: document.getElementById('prospect-service-records').checked,
          carfax_notes: document.getElementById('prospect-carfax-notes').value.trim() || null,
          personal_rating: selectedProspectRating || null,
          personal_notes: document.getElementById('prospect-notes').value.trim() || null
        };

        // Preserve existing status when editing, or set to 'considering' for new prospects
        if (editingProspectId) {
          const existingProspect = prospectVehicles.find(p => p.id === editingProspectId);
          if (existingProspect) {
            prospectData.status = existingProspect.status;
          }
        } else {
          prospectData.status = 'considering';
        }

        let result;
        if (editingProspectId) {
          result = await supabaseClient
            .from('prospect_vehicles')
            .update(prospectData)
            .eq('id', editingProspectId)
            .eq('user_id', session.user.id);
        } else {
          result = await supabaseClient
            .from('prospect_vehicles')
            .insert(prospectData);
        }

        if (result.error) throw result.error;

        showToast(editingProspectId ? 'Prospect updated!' : 'Prospect added!', 'success');
        closeAddProspectModal();
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error saving prospect:', error);
        showToast('Failed to save prospect: ' + error.message, 'error');
      }
    }

    async function editProspect(id) {
      const prospect = prospectVehicles.find(p => p.id === id);
      if (!prospect) return;

      editingProspectId = id;
      
      document.getElementById('prospect-vin').value = prospect.vin || '';
      document.getElementById('prospect-year').value = prospect.year || '';
      document.getElementById('prospect-make').value = prospect.make || '';
      document.getElementById('prospect-model').value = prospect.model || '';
      document.getElementById('prospect-trim').value = prospect.trim || '';
      document.getElementById('prospect-body-style').value = prospect.body_style || '';
      document.getElementById('prospect-engine').value = prospect.engine || '';
      document.getElementById('prospect-fuel-type').value = prospect.fuel_type || '';
      document.getElementById('prospect-mileage').value = prospect.mileage || '';
      document.getElementById('prospect-price').value = prospect.asking_price || '';
      document.getElementById('prospect-ext-color').value = prospect.exterior_color || '';
      document.getElementById('prospect-int-color').value = prospect.interior_color || '';
      document.getElementById('prospect-seller-type').value = prospect.seller_type || '';
      document.getElementById('prospect-seller-name').value = prospect.seller_name || '';
      document.getElementById('prospect-location').value = prospect.seller_location || '';
      document.getElementById('prospect-listing-url').value = prospect.listing_url || '';
      document.getElementById('prospect-accidents').value = prospect.carfax_accidents || '';
      document.getElementById('prospect-owners').value = prospect.carfax_owners || '';
      document.getElementById('prospect-service-records').checked = prospect.carfax_service_records || false;
      document.getElementById('prospect-carfax-notes').value = prospect.carfax_notes || '';
      document.getElementById('prospect-notes').value = prospect.personal_notes || '';
      
      selectedProspectRating = prospect.personal_rating || 0;
      document.getElementById('prospect-rating').value = selectedProspectRating;
      updateRatingStars();

      document.getElementById('add-prospect-modal').style.display = 'flex';
    }

    async function deleteProspect(id) {
      if (!confirm('Are you sure you want to delete this prospect?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .delete()
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;

        showToast('Prospect deleted', 'success');
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error deleting prospect:', error);
        showToast('Failed to delete prospect', 'error');
      }
    }

    async function toggleFavorite(id) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const prospect = prospectVehicles.find(p => p.id === id);
        if (!prospect) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .update({ is_favorite: !prospect.is_favorite })
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;

        await loadProspectVehicles();
      } catch (error) {
        console.error('Error toggling favorite:', error);
      }
    }

    function viewProspect(id) {
      const prospect = prospectVehicles.find(p => p.id === id);
      if (!prospect) return;

      const matchScore = calculateMatchScore(prospect);
      const statusLabels = {
        considering: 'Considering',
        test_driven: 'Test Driven',
        offer_made: 'Offer Made',
        purchased: 'Purchased',
        passed: 'Passed'
      };

      document.getElementById('view-prospect-title').textContent = `${prospect.year || ''} ${prospect.make || ''} ${prospect.model || ''}`.trim() || 'Prospect Details';
      
      document.getElementById('view-prospect-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Vehicle Info</h4>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
              <p style="margin-bottom:8px;"><strong>Year:</strong> ${prospect.year || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Make:</strong> ${prospect.make || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Model:</strong> ${prospect.model || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Trim:</strong> ${prospect.trim || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Body Style:</strong> ${prospect.body_style || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Engine:</strong> ${prospect.engine || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Fuel Type:</strong> ${prospect.fuel_type || 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Mileage:</strong> ${prospect.mileage ? Number(prospect.mileage).toLocaleString() + ' mi' : 'N/A'}</p>
              <p style="margin-bottom:8px;"><strong>Colors:</strong> ${prospect.exterior_color || '?'} / ${prospect.interior_color || '?'}</p>
              ${prospect.vin ? `<p style="margin-bottom:0;"><strong>VIN:</strong> ${prospect.vin}</p>` : ''}
            </div>
          </div>
          <div>
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Pricing & Seller</h4>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
              <p style="font-size:1.5rem;font-weight:700;color:var(--accent-gold);margin-bottom:12px;">${prospect.asking_price ? '$' + Number(prospect.asking_price).toLocaleString() : 'Price TBD'}</p>
              <p style="margin-bottom:8px;"><strong>Seller:</strong> ${prospect.seller_name || 'Unknown'} (${prospect.seller_type || 'N/A'})</p>
              <p style="margin-bottom:8px;"><strong>Location:</strong> ${prospect.seller_location || 'N/A'}</p>
              ${prospect.listing_url ? `<p style="margin-bottom:0;"><a href="${prospect.listing_url}" target="_blank" style="color:var(--accent-blue);">View Listing →</a></p>` : ''}
            </div>
          </div>
        </div>

        <div style="margin-top:24px;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Vehicle History (Carfax)</h4>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;color:${prospect.carfax_accidents === 0 ? 'var(--accent-green)' : prospect.carfax_accidents <= 1 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${prospect.carfax_accidents ?? '?'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Accidents</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;color:var(--text-primary);">${prospect.carfax_owners ?? '?'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Owners</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;margin-bottom:4px;">${prospect.carfax_service_records ? mccIcon('check-circle', 16) : mccIcon('x', 16)}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Service Records</div>
            </div>
          </div>
          ${prospect.carfax_notes ? `<p style="margin-top:12px;font-size:0.9rem;color:var(--text-secondary);">${prospect.carfax_notes}</p>` : ''}
        </div>

        <div style="margin-top:24px;display:flex;gap:24px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Your Rating</h4>
            <div style="font-size:28px;color:var(--accent-gold);">
              ${prospect.personal_rating ? mccIcon('star', 16).repeat(prospect.personal_rating) + mccIcon('star', 16).repeat(5 - prospect.personal_rating) : mccIcon('star', 16).repeat(5)}
            </div>
          </div>
          ${matchScore !== null ? `
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Match Score</h4>
            <div style="font-size:2.5rem;font-weight:700;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}%</div>
          </div>
          ` : ''}
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Status</h4>
            <select onchange="updateProspectStatus('${prospect.id}', this.value)" style="padding:10px 16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);">
              <option value="considering" ${prospect.status === 'considering' ? 'selected' : ''}>Considering</option>
              <option value="test_driven" ${prospect.status === 'test_driven' ? 'selected' : ''}>Test Driven</option>
              <option value="offer_made" ${prospect.status === 'offer_made' ? 'selected' : ''}>Offer Made</option>
              <option value="purchased" ${prospect.status === 'purchased' ? 'selected' : ''}>Purchased</option>
              <option value="passed" ${prospect.status === 'passed' ? 'selected' : ''}>Passed</option>
            </select>
          </div>
        </div>

        ${prospect.personal_notes ? `
        <div style="margin-top:24px;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Your Notes</h4>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);color:var(--text-secondary);line-height:1.6;">${prospect.personal_notes}</div>
        </div>
        ` : ''}

        <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="editProspect('${prospect.id}');closeViewProspectModal();">${mccIcon('file-text', 16)} Edit</button>
          <button class="btn btn-secondary" onclick="toggleFavorite('${prospect.id}');closeViewProspectModal();">${prospect.is_favorite ? mccIcon('heart', 16) + ' Unfavorite' : mccIcon('heart', 16) + ' Favorite'}</button>
          <button class="btn btn-danger" onclick="deleteProspect('${prospect.id}');closeViewProspectModal();">${mccIcon('x', 16)} Delete</button>
        </div>
      `;

      document.getElementById('view-prospect-modal').style.display = 'flex';
    }

    function closeViewProspectModal() {
      document.getElementById('view-prospect-modal').style.display = 'none';
    }

    async function updateProspectStatus(id, status) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
          .from('prospect_vehicles')
          .update({ status })
          .eq('id', id)
          .eq('user_id', session.user.id);

        if (error) throw error;
        
        showToast('Status updated', 'success');
        await loadProspectVehicles();
      } catch (error) {
        console.error('Error updating status:', error);
      }
    }

    function updateCompareSelection() {
      const container = document.getElementById('compare-selection');
      
      if (prospectVehicles.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Add prospect vehicles first to compare them.</p>';
        document.getElementById('compare-btn').disabled = true;
        return;
      }

      container.innerHTML = prospectVehicles.map(p => `
        <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg-input);border:1px solid ${selectedForComparison.has(p.id) ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-md);cursor:pointer;transition:all 0.2s;">
          <input type="checkbox" ${selectedForComparison.has(p.id) ? 'checked' : ''} onchange="toggleCompareSelection('${p.id}')" style="width:18px;height:18px;accent-color:var(--accent-gold);">
          <span>${p.year || ''} ${p.make || ''} ${p.model || ''}</span>
        </label>
      `).join('');

      document.getElementById('compare-btn').disabled = selectedForComparison.size < 2;
    }

    function toggleCompareSelection(id) {
      if (selectedForComparison.has(id)) {
        selectedForComparison.delete(id);
      } else {
        if (selectedForComparison.size >= 4) {
          showToast('Maximum 4 vehicles for comparison', 'error');
          return;
        }
        selectedForComparison.add(id);
      }
      updateCompareSelection();
    }

    function generateComparison() {
      if (selectedForComparison.size < 2) {
        showToast('Select at least 2 vehicles to compare', 'error');
        return;
      }

      const selected = prospectVehicles.filter(p => selectedForComparison.has(p.id));
      
      const thead = document.getElementById('comparison-thead');
      const tbody = document.getElementById('comparison-tbody');
      
      thead.innerHTML = `
        <tr>
          <th style="padding:12px 16px;text-align:left;background:var(--bg-input);border-bottom:1px solid var(--border-subtle);font-weight:600;color:var(--text-muted);font-size:0.85rem;">Attribute</th>
          ${selected.map(p => `<th style="padding:12px 16px;text-align:center;background:var(--bg-input);border-bottom:1px solid var(--border-subtle);font-weight:600;">${p.year || ''} ${p.make || ''} ${p.model || ''}</th>`).join('')}
        </tr>
      `;

      const rows = [
        { label: 'Asking Price', key: 'asking_price', format: v => v ? '$' + Number(v).toLocaleString() : 'N/A', best: 'low' },
        { label: 'Mileage', key: 'mileage', format: v => v ? Number(v).toLocaleString() + ' mi' : 'N/A', best: 'low' },
        { label: 'Year', key: 'year', format: v => v || 'N/A', best: 'high' },
        { label: 'Trim', key: 'trim', format: v => v || 'N/A' },
        { label: 'Engine', key: 'engine', format: v => v || 'N/A' },
        { label: 'Fuel Type', key: 'fuel_type', format: v => v || 'N/A' },
        { label: 'Body Style', key: 'body_style', format: v => v || 'N/A' },
        { label: 'Exterior Color', key: 'exterior_color', format: v => v || 'N/A' },
        { label: 'Accidents', key: 'carfax_accidents', format: v => v !== null ? v : 'N/A', best: 'low' },
        { label: 'Previous Owners', key: 'carfax_owners', format: v => v || 'N/A', best: 'low' },
        { label: 'Service Records', key: 'carfax_service_records', format: v => v ? mccIcon('check-circle', 16) + ' Yes' : mccIcon('x', 16) + ' No' },
        { label: 'Your Rating', key: 'personal_rating', format: v => v ? mccIcon('star', 16).repeat(v) : 'N/A', best: 'high' },
        { label: 'Match Score', key: null, format: (v, p) => { const s = calculateMatchScore(p); return s !== null ? s + '%' : 'N/A'; }, best: 'high', isComputed: true }
      ];

      tbody.innerHTML = rows.map(row => {
        const values = selected.map(p => row.isComputed ? row.format(null, p) : row.format(p[row.key]));
        const numericValues = selected.map(p => {
          if (row.isComputed) return calculateMatchScore(p);
          return typeof p[row.key] === 'number' ? p[row.key] : null;
        });
        
        let bestIdx = -1;
        if (row.best && numericValues.some(v => v !== null)) {
          const validValues = numericValues.filter(v => v !== null);
          if (row.best === 'low') {
            const minVal = Math.min(...validValues);
            bestIdx = numericValues.indexOf(minVal);
          } else {
            const maxVal = Math.max(...validValues);
            bestIdx = numericValues.indexOf(maxVal);
          }
        }

        return `
          <tr>
            <td style="padding:12px 16px;border-bottom:1px solid var(--border-subtle);font-weight:500;">${row.label}</td>
            ${values.map((v, i) => `
              <td style="padding:12px 16px;text-align:center;border-bottom:1px solid var(--border-subtle);${bestIdx === i ? 'color:var(--accent-green);font-weight:600;' : ''}">${v}</td>
            `).join('')}
          </tr>
        `;
      }).join('');

      document.getElementById('comparison-results').style.display = 'block';
    }

    async function loadCarPreferences() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
          .from('member_car_preferences')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        memberCarPreferences = data;
        
        if (data) {
          document.getElementById('pref-min-budget').value = data.min_budget || '';
          document.getElementById('pref-max-budget').value = data.max_budget || '';
          document.getElementById('pref-min-year').value = data.min_year || '';
          document.getElementById('pref-max-year').value = data.max_year || '';
          document.getElementById('pref-max-mileage').value = data.max_mileage || '';
          document.getElementById('pref-fuel').value = data.fuel_preference || '';
          document.getElementById('pref-transmission').value = data.transmission_preference || '';
          document.getElementById('pref-drivetrain').value = data.drivetrain_preference || '';
          document.getElementById('pref-makes').value = (data.preferred_makes || []).join(', ');
          document.getElementById('pref-must-have').value = (data.must_have_features || []).join(', ');
          document.getElementById('pref-deal-breakers').value = (data.deal_breakers || []).join(', ');
          document.getElementById('pref-notes').value = data.notes || '';
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }

    async function saveCarPreferences(e) {
      e.preventDefault();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to save preferences', 'error');
          return;
        }

        const parseList = (val) => val ? val.split(',').map(s => s.trim()).filter(s => s) : [];

        const prefData = {
          user_id: session.user.id,
          min_budget: Number.parseFloat(document.getElementById('pref-min-budget').value) || null,
          max_budget: Number.parseFloat(document.getElementById('pref-max-budget').value) || null,
          min_year: Number.parseInt(document.getElementById('pref-min-year').value) || null,
          max_year: Number.parseInt(document.getElementById('pref-max-year').value) || null,
          max_mileage: Number.parseInt(document.getElementById('pref-max-mileage').value) || null,
          fuel_preference: document.getElementById('pref-fuel').value || null,
          transmission_preference: document.getElementById('pref-transmission').value || null,
          drivetrain_preference: document.getElementById('pref-drivetrain').value || null,
          preferred_makes: parseList(document.getElementById('pref-makes').value),
          must_have_features: parseList(document.getElementById('pref-must-have').value),
          deal_breakers: parseList(document.getElementById('pref-deal-breakers').value),
          notes: document.getElementById('pref-notes').value.trim() || null
        };

        const { data: existing } = await supabaseClient
          .from('member_car_preferences')
          .select('id')
          .eq('user_id', session.user.id)
          .single();

        let result;
        if (existing) {
          result = await supabaseClient
            .from('member_car_preferences')
            .update(prefData)
            .eq('user_id', session.user.id);
        } else {
          result = await supabaseClient
            .from('member_car_preferences')
            .insert(prefData);
        }

        if (result.error) throw result.error;

        memberCarPreferences = prefData;
        showToast('Preferences saved!', 'success');
        renderProspects();
      } catch (error) {
        console.error('Error saving preferences:', error);
        showToast('Failed to save preferences: ' + error.message, 'error');
      }
    }

    function clearCarPreferences() {
      document.getElementById('preferences-form').reset();
    }

    // Load prospects when My Next Car section is shown
    const originalShowSectionForNextCar = showSection;
    showSection = function(sectionId) {
      originalShowSectionForNextCar(sectionId);
      if (sectionId === 'my-next-car') {
        loadProspectVehicles();
        loadCarPreferences();
      }
      if (sectionId === 'shop') {
        loadShopProducts();
      }
    };


    // ========== SHOP SECTION ==========
    let shopCart = [];
    let shopProducts = [];
    let currentShopFilter = 'all';

    // Placeholder products (will be replaced with Printful API data)
    const placeholderProducts = [
      {
        id: 'prod_1',
        name: 'MCC Classic Logo T-Shirt',
        category: 'apparel',
        price: 29.99,
        image: null,
        variants: [
          { id: 'var_1a', name: 'Small', price: 29.99 },
          { id: 'var_1b', name: 'Medium', price: 29.99 },
          { id: 'var_1c', name: 'Large', price: 29.99 },
          { id: 'var_1d', name: 'XL', price: 29.99 }
        ]
      },
      {
        id: 'prod_2',
        name: 'MCC Premium Hoodie',
        category: 'apparel',
        price: 59.99,
        image: null,
        variants: [
          { id: 'var_2a', name: 'Small', price: 59.99 },
          { id: 'var_2b', name: 'Medium', price: 59.99 },
          { id: 'var_2c', name: 'Large', price: 59.99 },
          { id: 'var_2d', name: 'XL', price: 59.99 }
        ]
      },
      {
        id: 'prod_3',
        name: 'MCC Performance Cap',
        category: 'accessories',
        price: 24.99,
        image: null,
        variants: [
          { id: 'var_3a', name: 'One Size', price: 24.99 }
        ]
      },
      {
        id: 'prod_4',
        name: 'MCC Travel Mug',
        category: 'accessories',
        price: 19.99,
        image: null,
        variants: [
          { id: 'var_4a', name: '16oz', price: 19.99 },
          { id: 'var_4b', name: '20oz', price: 22.99 }
        ]
      },
      {
        id: 'prod_5',
        name: 'MCC Keychain',
        category: 'accessories',
        price: 12.99,
        image: null,
        variants: [
          { id: 'var_5a', name: 'Standard', price: 12.99 }
        ]
      },
      {
        id: 'prod_6',
        name: 'MCC Logo Decal - Small',
        category: 'decals',
        price: 5.99,
        image: null,
        variants: [
          { id: 'var_6a', name: 'White', price: 5.99 },
          { id: 'var_6b', name: 'Gold', price: 5.99 },
          { id: 'var_6c', name: 'Black', price: 5.99 }
        ]
      },
      {
        id: 'prod_7',
        name: 'MCC Logo Decal - Large',
        category: 'decals',
        price: 9.99,
        image: null,
        variants: [
          { id: 'var_7a', name: 'White', price: 9.99 },
          { id: 'var_7b', name: 'Gold', price: 9.99 },
          { id: 'var_7c', name: 'Black', price: 9.99 }
        ]
      },
      {
        id: 'prod_8',
        name: 'MCC Window Sticker Pack',
        category: 'decals',
        price: 14.99,
        image: null,
        variants: [
          { id: 'var_8a', name: '5-Pack', price: 14.99 },
          { id: 'var_8b', name: '10-Pack', price: 24.99 }
        ]
      }
    ];

    // Load cart from localStorage
    function loadCartFromStorage() {
      try {
        const savedCart = localStorage.getItem('mcc_shop_cart');
        if (savedCart) {
          shopCart = JSON.parse(savedCart);
          updateCartUI();
        }
      } catch (e) {
        console.error('Error loading cart:', e);
        shopCart = [];
      }
    }

    // Save cart to localStorage
    function saveCartToStorage() {
      try {
        localStorage.setItem('mcc_shop_cart', JSON.stringify(shopCart));
      } catch (e) {
        console.error('Error saving cart:', e);
      }
    }

    async function loadShopProducts() {
      loadCartFromStorage();
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/shop/products`);
        const data = await response.json();
        
        if (data.success && data.products && data.products.length > 0) {
          shopProducts = data.products;
          if (data.source === 'placeholder') {
            console.log('Using placeholder products - Printful API not configured');
          }
        } else {
          shopProducts = placeholderProducts;
        }
      } catch (error) {
        console.error('Error loading shop products:', error);
        shopProducts = placeholderProducts;
      }
      
      renderShopProducts();
    }

    // Render shop products
    function renderShopProducts() {
      const grid = document.getElementById('shop-products-grid');
      const emptyState = document.getElementById('shop-empty-state');
      
      const filteredProducts = currentShopFilter === 'all' 
        ? shopProducts 
        : shopProducts.filter(p => p.category === currentShopFilter);
      
      if (filteredProducts.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      
      grid.innerHTML = filteredProducts.map(product => `
        <div class="product-card" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden;transition:all 0.3s ease;">
          <div class="product-image-container" style="height:180px;position:relative;border-bottom:1px solid var(--border-subtle);overflow:hidden;">
            <div class="product-skeleton" style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));display:flex;align-items:center;justify-content:center;">
              <div class="skeleton-shimmer"></div>
              <span style="font-size:64px;opacity:0.5;">${getCategoryEmoji(product.category)}</span>
            </div>
            ${product.image ? `
              <img 
                src="${product.image}" 
                alt="${product.name}" 
                loading="lazy"
                class="product-image-lazy"
                style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.4s ease;"
                onload="this.style.opacity='1';this.previousElementSibling.style.display='none';"
                onerror="this.style.display='none';"
              />
            ` : `
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));">
                ${getCategoryEmoji(product.category)}
              </div>
            `}
          </div>
          <div class="product-info" style="padding:16px;">
            <h4 style="font-size:0.95rem;font-weight:600;margin-bottom:8px;line-height:1.3;">${product.name}</h4>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="font-size:1.1rem;font-weight:700;color:var(--accent-gold);">$${product.price.toFixed(2)}</span>
              <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">${product.category}</span>
            </div>
            ${product.variants.length > 1 ? `
              <select id="variant-${product.id}" class="form-select" style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.85rem;margin-bottom:12px;">
                ${product.variants.map(v => `<option value="${v.id}" data-price="${v.price}">${v.name}${v.price !== product.price ? ` (+$${(v.price - product.price).toFixed(2)})` : ''}</option>`).join('')}
              </select>
            ` : ''}
            <button class="btn btn-primary" onclick="addToCart('${product.id}')" style="width:100%;padding:10px 16px;font-size:0.88rem;">
              Add to Cart
            </button>
          </div>
        </div>
      `).join('');
    }

    function getCategoryEmoji(category) {
      switch (category) {
        case 'apparel': return mccIcon('shopping-cart', 16);
        case 'accessories': return mccIcon('shopping-cart', 16);
        case 'decals': return mccIcon('ticket', 16);
        default: return mccIcon('package', 16);
      }
    }

    // Filter shop products by category
    function filterShopProducts(category) {
      currentShopFilter = category;
      
      // Update filter button states
      document.querySelectorAll('.shop-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
          btn.classList.add('active');
        }
      });
      
      renderShopProducts();
    }

    // Add item to cart
    function addToCart(productId) {
      const product = shopProducts.find(p => p.id === productId);
      if (!product) return;
      
      let selectedVariant = product.variants[0];
      
      // Check if there's a variant selector
      const variantSelect = document.getElementById(`variant-${productId}`);
      if (variantSelect) {
        const selectedOption = variantSelect.options[variantSelect.selectedIndex];
        selectedVariant = product.variants.find(v => v.id === selectedOption.value) || selectedVariant;
      }
      
      // Check if item already in cart
      const existingIndex = shopCart.findIndex(item => 
        item.productId === productId && item.variantId === selectedVariant.id
      );
      
      if (existingIndex >= 0) {
        shopCart[existingIndex].quantity++;
      } else {
        shopCart.push({
          productId: productId,
          variantId: selectedVariant.id,
          name: product.name,
          variantName: selectedVariant.name,
          price: selectedVariant.price,
          quantity: 1
        });
      }
      
      saveCartToStorage();
      updateCartUI();
      showToast(`Added ${product.name} to cart`, 'success');
    }

    // Remove item from cart
    function removeFromCart(index) {
      if (index >= 0 && index < shopCart.length) {
        const item = shopCart[index];
        shopCart.splice(index, 1);
        saveCartToStorage();
        updateCartUI();
        showToast(`Removed ${item.name} from cart`, 'info');
      }
    }

    // Update cart quantity
    function updateCartQuantity(index, quantity) {
      if (index >= 0 && index < shopCart.length) {
        if (quantity <= 0) {
          removeFromCart(index);
        } else {
          shopCart[index].quantity = quantity;
          saveCartToStorage();
          updateCartUI();
        }
      }
    }

    // Update cart UI
    function updateCartUI() {
      const totalItems = shopCart.reduce((sum, item) => sum + item.quantity, 0);
      const subtotal = shopCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // Update cart counts
      document.getElementById('cart-item-count').textContent = totalItems;
      const mobileCount = document.getElementById('mobile-cart-count');
      if (mobileCount) mobileCount.textContent = totalItems;
      
      // Update cart items list
      const cartList = document.getElementById('cart-items-list');
      const cartSummary = document.getElementById('cart-summary');
      const checkoutBtn = document.getElementById('checkout-btn');
      const clearCartBtn = document.getElementById('clear-cart-btn');
      
      if (shopCart.length === 0) {
        cartList.innerHTML = `
          <div class="empty-state" style="padding:24px 0;">
            <div style="font-size:40px;margin-bottom:12px;">${mccIcon('shopping-cart', 16)}</div>
            <p style="color:var(--text-muted);font-size:0.9rem;">Your cart is empty</p>
          </div>
        `;
        cartSummary.style.display = 'none';
        checkoutBtn.disabled = true;
        clearCartBtn.style.display = 'none';
      } else {
        cartList.innerHTML = shopCart.map((item, index) => `
          <div class="cart-item" style="display:flex;gap:12px;padding:12px;background:var(--bg-elevated);border-radius:var(--radius-sm);margin-bottom:8px;">
            <div style="flex:1;">
              <div style="font-size:0.9rem;font-weight:500;margin-bottom:4px;">${item.name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${item.variantName}</div>
              <div style="font-size:0.9rem;color:var(--accent-gold);font-weight:600;margin-top:4px;">$${(item.price * item.quantity).toFixed(2)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="display:flex;align-items:center;gap:4px;">
                <button class="btn btn-ghost" onclick="updateCartQuantity(${index}, ${item.quantity - 1})" style="padding:4px 8px;font-size:0.9rem;">−</button>
                <span style="min-width:24px;text-align:center;">${item.quantity}</span>
                <button class="btn btn-ghost" onclick="updateCartQuantity(${index}, ${item.quantity + 1})" style="padding:4px 8px;font-size:0.9rem;">+</button>
              </div>
              <button class="btn btn-ghost" onclick="removeFromCart(${index})" style="padding:4px 8px;font-size:0.75rem;color:var(--accent-red);">Remove</button>
            </div>
          </div>
        `).join('');
        
        cartSummary.style.display = 'block';
        document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('cart-total').textContent = `$${subtotal.toFixed(2)}`;
        checkoutBtn.disabled = false;
        clearCartBtn.style.display = 'block';
      }
      
      // Update modal cart if open
      const modalItems = document.getElementById('cart-modal-items');
      if (modalItems) {
        modalItems.innerHTML = cartList.innerHTML;
      }
      const modalSubtotal = document.getElementById('cart-modal-subtotal');
      const modalTotal = document.getElementById('cart-modal-total');
      if (modalSubtotal) modalSubtotal.textContent = `$${subtotal.toFixed(2)}`;
      if (modalTotal) modalTotal.textContent = `$${subtotal.toFixed(2)}`;
    }

    // Show cart modal (for mobile)
    function showCartModal() {
      updateCartUI();
      document.getElementById('cart-modal').classList.add('active');
    }

    // Clear entire cart
    function clearCart() {
      if (confirm('Are you sure you want to clear your cart?')) {
        shopCart = [];
        saveCartToStorage();
        updateCartUI();
        showToast('Cart cleared', 'info');
      }
    }

    async function proceedToCheckout() {
      if (shopCart.length === 0) {
        showToast('Your cart is empty', 'error');
        return;
      }
      
      const checkoutBtn = document.getElementById('checkout-btn');
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Processing...';
      }
      
      try {
        const session = await supabaseClient.auth.getSession();
        const token = session?.data?.session?.access_token;
        
        if (!token) {
          showToast('Please log in to checkout', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const checkoutItems = shopCart.map(item => {
          const product = shopProducts.find(p => p.id === item.productId);
          const variant = product?.variants?.find(v => v.id === item.variantId);
          
          return {
            productId: item.productId,
            variantId: item.variantId,
            printfulSyncVariantId: variant?.printfulSyncVariantId || null,
            name: item.name,
            variantName: item.variantName,
            price: item.price,
            quantity: item.quantity
          };
        });
        
        const response = await fetch(`${apiBase}/api/shop/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ items: checkoutItems })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Checkout failed');
        }
        
        if (data.url) {
          shopCart = [];
          saveCartToStorage();
          window.location.href = data.url;
        } else if (data.sessionId) {
          const stripeConfig = await fetch(`${apiBase}/api/config/stripe`);
          const { publishableKey } = await stripeConfig.json();
          
          if (!publishableKey) {
            throw new Error('Stripe not configured');
          }
          
          const stripe = Stripe(publishableKey);
          shopCart = [];
          saveCartToStorage();
          await stripe.redirectToCheckout({ sessionId: data.sessionId });
        } else {
          throw new Error('Invalid checkout response');
        }
        
      } catch (error) {
        console.error('Checkout error:', error);
        showToast('Checkout failed: ' + error.message, 'error');
      } finally {
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = 'Checkout';
        }
      }
    }

    // Initialize shop on page load
    loadCartFromStorage();

    // ========== ORDER HISTORY ==========
    let memberOrders = [];

    async function loadOrderHistory() {
      if (!currentUser?.id) return;
      
      const loading = document.getElementById('order-history-loading');
      const empty = document.getElementById('order-history-empty');
      const list = document.getElementById('order-history-list');
      
      loading.style.display = 'block';
      empty.style.display = 'none';
      list.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const response = await fetch(`/api/member/${currentUser.id}/orders`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }
        
        const data = await response.json();
        memberOrders = data.orders || [];
        
        loading.style.display = 'none';
        
        if (memberOrders.length === 0) {
          empty.style.display = 'block';
        } else {
          renderOrderHistory(memberOrders);
          list.style.display = 'flex';
        }
      } catch (error) {
        console.error('Error loading order history:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        showToast('Failed to load order history', 'error');
      }
    }

    function renderOrderHistory(orders) {
      const list = document.getElementById('order-history-list');
      
      list.innerHTML = orders.map(order => {
        const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const orderNumber = order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemCount = order.items?.length || 0;
        const itemText = itemCount === 1 ? '1 item' : `${itemCount} items`;
        const total = order.total_amount ? `$${(order.total_amount / 100).toFixed(2)}` : '$0.00';
        const status = order.status || 'pending';
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        
        const itemsHtml = (order.items || []).map(item => `
          <div class="order-item-row">
            <div class="order-item-image">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : mccIcon('package', 16)}
            </div>
            <div class="order-item-info">
              <div class="order-item-name">${item.name || 'Product'}</div>
              ${item.variant ? `<div class="order-item-variant">${item.variant}</div>` : ''}
            </div>
            <div class="order-item-qty">x${item.quantity || 1}</div>
            <div class="order-item-price">$${((item.price || 0) / 100).toFixed(2)}</div>
          </div>
        `).join('');
        
        const shippingHtml = order.shipping_address ? `
          <div class="order-details-section">
            <div class="order-details-title">Shipping Address</div>
            <div class="order-shipping-info">
              <p><strong>${order.shipping_address.name || ''}</strong></p>
              <p>${order.shipping_address.line1 || ''}</p>
              ${order.shipping_address.line2 ? `<p>${order.shipping_address.line2}</p>` : ''}
              <p>${order.shipping_address.city || ''}, ${order.shipping_address.state || ''} ${order.shipping_address.postal_code || ''}</p>
              <p>${order.shipping_address.country || ''}</p>
            </div>
          </div>
        ` : '';
        
        const trackingHtml = order.tracking_number || order.tracking_url ? `
          <div class="order-details-section">
            <div class="order-details-title">Tracking</div>
            <div class="order-shipping-info">
              ${order.tracking_number ? `<p><strong>Tracking #:</strong> ${order.tracking_number}</p>` : ''}
              ${order.tracking_url ? `
                <button class="btn btn-primary btn-sm order-tracking-btn" onclick="trackOrder('${order.id}')">
                  ${mccIcon('map-pin', 16)} Track Shipment
                </button>
              ` : ''}
            </div>
          </div>
        ` : '';
        
        return `
          <div class="order-card" id="order-${order.id}">
            <div class="order-card-header" onclick="toggleOrderDetails('${order.id}')">
              <div class="order-card-info">
                <div class="order-icon">${mccIcon('package', 16)}</div>
                <div class="order-meta">
                  <div class="order-number">${orderNumber}</div>
                  <div class="order-date">${orderDate}</div>
                </div>
                <div class="order-summary">
                  <span class="order-items-count">${itemText}</span>
                  <span class="order-total">${total}</span>
                </div>
              </div>
              <span class="order-status ${status}">${statusLabel}</span>
              <span class="order-expand-icon">${mccIcon('chevron-down', 12)}</span>
            </div>
            <div class="order-details">
              <div class="order-details-section">
                <div class="order-details-title">Items</div>
                ${itemsHtml || '<p style="color:var(--text-muted);">No items</p>'}
              </div>
              ${shippingHtml}
              ${trackingHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    function toggleOrderDetails(orderId) {
      const orderCard = document.getElementById(`order-${orderId}`);
      if (orderCard) {
        orderCard.classList.toggle('expanded');
      }
    }

    function trackOrder(orderId) {
      const order = memberOrders.find(o => o.id === orderId);
      if (order?.tracking_url) {
        window.open(order.tracking_url, '_blank');
      } else if (order?.tracking_number) {
        const trackingUrl = `https://www.google.com/search?q=track+${encodeURIComponent(order.tracking_number)}`;
        window.open(trackingUrl, '_blank');
      } else {
        showToast('No tracking information available', 'error');
      }
    }

    // ========== REFERRAL PROGRAM ==========
    let memberReferralCode = null;
    let memberReferrals = [];
    let memberCredits = [];
    let totalReferralCredits = 0;

    async function loadReferralData() {
      if (!currentUser?.id) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        
        const [codeRes, referralsRes, creditsRes] = await Promise.all([
          fetch(`/api/member/${currentUser.id}/referral-code`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/member/${currentUser.id}/referrals`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/member/${currentUser.id}/credits`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);
        
        if (codeRes.ok) {
          const codeData = await codeRes.json();
          if (codeData.success && codeData.referral_code) {
            memberReferralCode = codeData.referral_code;
            document.getElementById('referral-code-display').textContent = memberReferralCode;
          }
        }
        
        if (referralsRes.ok) {
          const referralsData = await referralsRes.json();
          if (referralsData.success) {
            memberReferrals = referralsData.referrals || [];
            renderReferrals();
          }
        }
        
        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          if (creditsData.success) {
            memberCredits = creditsData.credits || [];
            totalReferralCredits = creditsData.total_credits || 0;
            updateReferralStats();
          }
        }
        
      } catch (error) {
        console.error('Error loading referral data:', error);
        document.getElementById('referral-code-display').textContent = 'Error';
      }
    }

    function updateReferralStats() {
      const totalCreditsEl = document.getElementById('referral-total-credits');
      const completedCountEl = document.getElementById('referral-completed-count');
      const pendingCountEl = document.getElementById('referral-pending-count');
      const creditsBadge = document.getElementById('referral-credits-badge');
      
      const completedCount = memberReferrals.filter(r => r.status === 'credited' || r.status === 'completed').length;
      const pendingCount = memberReferrals.filter(r => r.status === 'pending').length;
      
      if (totalCreditsEl) {
        totalCreditsEl.textContent = `$${(totalReferralCredits / 100).toFixed(0)}`;
      }
      if (completedCountEl) {
        completedCountEl.textContent = completedCount;
      }
      if (pendingCountEl) {
        pendingCountEl.textContent = pendingCount;
      }
      
      if (creditsBadge) {
        if (totalReferralCredits > 0) {
          creditsBadge.textContent = `$${(totalReferralCredits / 100).toFixed(0)}`;
          creditsBadge.style.display = 'inline-block';
        } else {
          creditsBadge.style.display = 'none';
        }
      }
    }

    function renderReferrals() {
      const loadingEl = document.getElementById('referrals-loading');
      const emptyEl = document.getElementById('referrals-empty');
      const listEl = document.getElementById('referrals-list');
      
      if (loadingEl) loadingEl.style.display = 'none';
      
      if (memberReferrals.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (listEl) listEl.style.display = 'none';
        return;
      }
      
      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) {
        listEl.style.display = 'flex';
        listEl.innerHTML = memberReferrals.map(referral => {
          const date = new Date(referral.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          });
          
          let statusClass = '';
          let statusLabel = '';
          let statusIcon = '';
          
          switch (referral.status) {
            case 'credited':
            case 'completed':
              statusClass = 'background:var(--accent-green-soft);color:var(--accent-green);';
              statusLabel = 'Completed';
              statusIcon = mccIcon('check-circle', 16);
              break;
            case 'pending':
            default:
              statusClass = 'background:var(--accent-orange-soft);color:var(--accent-orange);';
              statusLabel = 'Pending';
              statusIcon = mccIcon('clock', 16);
              break;
          }
          
          const creditAmount = referral.status === 'credited' ? `+$${(referral.credit_amount / 100).toFixed(0)}` : '-';
          
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:12px;border:1px solid var(--border-subtle);">
              <div style="display:flex;align-items:center;gap:16px;">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--accent-blue-soft);display:flex;align-items:center;justify-content:center;font-size:20px;">${mccIcon('user', 20)}</div>
                <div>
                  <div style="font-weight:600;margin-bottom:2px;">${referral.referred_name || 'Member'}</div>
                  <div style="font-size:0.85rem;color:var(--text-muted);">Joined ${date}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:16px;">
                <span style="font-weight:600;color:${referral.status === 'credited' ? 'var(--accent-gold)' : 'var(--text-muted)'};">${creditAmount}</span>
                <span style="padding:6px 12px;border-radius:100px;font-size:0.8rem;font-weight:500;${statusClass}">${statusIcon} ${statusLabel}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    function copyReferralCode() {
      if (!memberReferralCode) {
        showToast('Referral code not loaded', 'error');
        return;
      }
      
      navigator.clipboard.writeText(memberReferralCode).then(() => {
        showToast('Referral code copied!', 'success');
      }).catch(() => {
        showToast('Failed to copy code', 'error');
      });
    }

    function copyReferralLink() {
      if (!memberReferralCode) {
        showToast('Referral code not loaded', 'error');
        return;
      }
      
      const baseUrl = window.location.origin;
      const referralLink = `${baseUrl}/signup-member.html?ref=${memberReferralCode}`;
      
      navigator.clipboard.writeText(referralLink).then(() => {
        showToast('Referral link copied!', 'success');
      }).catch(() => {
        showToast('Failed to copy link', 'error');
      });
    }

    function shareReferralEmail() {
      if (!memberReferralCode) {
        showToast('Referral code not loaded', 'error');
        return;
      }
      
      const baseUrl = window.location.origin;
      const referralLink = `${baseUrl}/signup-member.html?ref=${memberReferralCode}`;
      const subject = encodeURIComponent('Join My Car Concierge - Get $10 Off!');
      const body = encodeURIComponent(`Hey!

I've been using My Car Concierge for my car maintenance and services, and I think you'd love it too!

Sign up with my referral code and get a $10 welcome bonus:

Referral Code: ${memberReferralCode}
Sign Up Here: ${referralLink}

My Car Concierge connects you with trusted automotive service providers. It's super convenient!

See you there!`);
      
      window.open(`mailto:?subject=${subject}&body=${body}`);
    }

    function shareReferralSMS() {
      if (!memberReferralCode) {
        showToast('Referral code not loaded', 'error');
        return;
      }
      
      const baseUrl = window.location.origin;
      const referralLink = `${baseUrl}/signup-member.html?ref=${memberReferralCode}`;
      const message = encodeURIComponent(`Join My Car Concierge and get $10 off! Use my code ${memberReferralCode} or sign up here: ${referralLink}`);
      
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.open(`sms:&body=${message}`);
      } else {
        window.open(`sms:?body=${message}`);
      }
    }

    function shareReferralSocial(platform) {
      if (!memberReferralCode) {
        showToast('Referral code not loaded', 'error');
        return;
      }
      const baseUrl = window.location.origin;
      const referralLink = `${baseUrl}/signup-member.html?ref=${memberReferralCode}`;
      const message = `Join My Car Concierge and get $10 off your first service! Use my code ${memberReferralCode} or sign up here: ${referralLink}`;

      if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`, '_blank', 'width=600,height=400');
      } else if (platform === 'twitter') {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`, '_blank', 'width=600,height=400');
      } else if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }
    }
    window.shareReferralSocial = shareReferralSocial;
    window.copyReferralCode = copyReferralCode;
    window.copyReferralLink = copyReferralLink;
    window.shareReferralEmail = shareReferralEmail;
    window.shareReferralSMS = shareReferralSMS;

    const originalShowSectionForReferrals = showSection;
    showSection = function(sectionId) {
      if (sectionId === 'referrals') {
        loadReferralData();
      }
      if (sectionId === 'fuel-tracker') {
        loadFuelLogs();
      }
      if (sectionId === 'insurance') {
        loadInsuranceDocuments();
      }
      originalShowSectionForReferrals(sectionId);
    };


    // ========== FUEL TRACKER SECTION ==========
    let fuelLogs = [];
    let fuelStats = null;
    let fuelVehicleStats = {};
    let fuelMpgChart = null;
    let fuelSpendingChart = null;
    let editingFuelLogId = null;

    async function loadFuelLogs() {
      if (!currentUser) return;
      
      try {
        const vehicleFilter = document.getElementById('fuel-vehicle-filter')?.value || '';
        let url = `/api/member/${currentUser.id}/fuel-logs`;
        if (vehicleFilter) {
          url += `?vehicle_id=${vehicleFilter}`;
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          fuelLogs = data.fuel_logs || [];
          fuelStats = data.stats || {};
          fuelVehicleStats = data.vehicle_stats || {};
          
          updateFuelVehicleFilter();
          updateFuelStats();
          renderFuelLogs();
          renderFuelCharts();
        } else {
          console.error('Failed to load fuel logs:', data.error);
        }
      } catch (error) {
        console.error('Error loading fuel logs:', error);
      }
    }

    function updateFuelVehicleFilter() {
      const filter = document.getElementById('fuel-vehicle-filter');
      if (!filter) return;
      
      const currentValue = filter.value;
      
      filter.innerHTML = '<option value="">All Vehicles</option>';
      
      for (const vehicle of vehicles) {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        filter.appendChild(option);
      }
      
      if (currentValue) {
        filter.value = currentValue;
      }
    }

    function updateFuelStats() {
      const avgMpgEl = document.getElementById('fuel-avg-mpg');
      const monthlyEl = document.getElementById('fuel-monthly-cost');
      const costPerMileEl = document.getElementById('fuel-cost-per-mile');
      const totalGallonsEl = document.getElementById('fuel-total-gallons');
      
      if (avgMpgEl) {
        avgMpgEl.textContent = fuelStats.avg_mpg ? `${fuelStats.avg_mpg}` : '--';
      }
      if (monthlyEl) {
        monthlyEl.textContent = `$${(fuelStats.current_month_spent || 0).toFixed(0)}`;
      }
      if (costPerMileEl) {
        costPerMileEl.textContent = fuelStats.avg_cost_per_mile 
          ? `$${fuelStats.avg_cost_per_mile.toFixed(2)}` 
          : '--';
      }
      if (totalGallonsEl) {
        totalGallonsEl.textContent = (fuelStats.total_gallons || 0).toFixed(0);
      }
    }

    function renderFuelLogs() {
      const container = document.getElementById('fuel-logs-list');
      if (!container) return;
      
      if (fuelLogs.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:40px;">
            <div class="empty-state-icon">${mccIcon('fuel', 40)}</div>
            <p>No fuel logs yet.</p>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Start tracking your fuel expenses to see stats and trends.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:600px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Date</th>
                <th style="text-align:left;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Vehicle</th>
                <th style="text-align:right;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Odometer</th>
                <th style="text-align:right;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Gallons</th>
                <th style="text-align:right;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">$/Gal</th>
                <th style="text-align:right;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Total</th>
                <th style="text-align:left;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Station</th>
                <th style="text-align:center;padding:12px 8px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${fuelLogs.map(log => {
                const vehicle = log.vehicles || {};
                const vehicleName = vehicle.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown';
                const date = new Date(log.date).toLocaleDateString();
                const fuelTypeEmoji = getFuelTypeEmoji(log.fuel_type);
                
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);transition:background 0.2s;" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:14px 8px;font-size:0.9rem;">${date}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;">${vehicleName}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;">${log.odometer.toLocaleString()} mi</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;">${fuelTypeEmoji} ${Number.parseFloat(log.gallons).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;">$${Number.parseFloat(log.price_per_gallon).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;font-weight:600;color:var(--accent-gold);">$${Number.parseFloat(log.total_cost).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;color:var(--text-secondary);">${log.station_name || '-'}</td>
                    <td style="padding:14px 8px;text-align:center;">
                      <button class="btn btn-ghost btn-sm" onclick="editFuelLog('${log.id}')" title="Edit">${mccIcon('file-text', 16)}</button>
                      <button class="btn btn-ghost btn-sm" onclick="deleteFuelLog('${log.id}')" title="Delete" style="color:var(--accent-red);">${mccIcon('x', 16)}</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function getFuelTypeEmoji(type) {
      switch (type) {
        case 'regular': return mccIcon('fuel', 16);
        case 'mid-grade': return mccIcon('fuel', 16);
        case 'premium': return mccIcon('car', 16);
        case 'diesel': return mccIcon('fuel', 16);
        case 'electric': return mccIcon('zap', 16);
        default: return mccIcon('fuel', 16);
      }
    }

    function renderFuelCharts() {
      renderMpgTrendChart();
      renderFuelSpendingChart();
    }

    function renderMpgTrendChart() {
      const canvas = document.getElementById('fuel-mpg-chart');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      if (fuelMpgChart) {
        fuelMpgChart.destroy();
      }
      
      const mpgTrend = fuelStats.mpg_trend || [];
      
      if (mpgTrend.length === 0) {
        const container = document.getElementById('fuel-mpg-chart-container');
        if (container) {
          container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px;">Not enough data for MPG trend. Add more fill-ups!</p>';
        }
        return;
      }
      
      fuelMpgChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: mpgTrend.map(e => new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [{
            label: 'MPG',
            data: mpgTrend.map(e => e.mpg),
            borderColor: '#d4a855',
            backgroundColor: 'rgba(212, 168, 85, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#d4a855'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { color: 'rgba(148, 148, 168, 0.1)' },
              ticks: { color: '#9898a8' }
            },
            y: {
              grid: { color: 'rgba(148, 148, 168, 0.1)' },
              ticks: { color: '#9898a8' }
            }
          }
        }
      });
    }

    function renderFuelSpendingChart() {
      const canvas = document.getElementById('fuel-spending-chart');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      if (fuelSpendingChart) {
        fuelSpendingChart.destroy();
      }
      
      const monthlySpending = fuelStats.monthly_spending || {};
      const sortedMonths = Object.keys(monthlySpending).sort().slice(-6);
      
      if (sortedMonths.length === 0) {
        const container = document.getElementById('fuel-spending-chart-container');
        if (container) {
          container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px;">No spending data yet. Add your first fill-up!</p>';
        }
        return;
      }
      
      fuelSpendingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sortedMonths.map(m => {
            const [year, month] = m.split('-');
            return new Date(year, Number.parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          }),
          datasets: [{
            label: 'Fuel Spending',
            data: sortedMonths.map(m => monthlySpending[m] || 0),
            backgroundColor: 'rgba(74, 124, 255, 0.6)',
            borderColor: '#4a7cff',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#9898a8' }
            },
            y: {
              grid: { color: 'rgba(148, 148, 168, 0.1)' },
              ticks: { 
                color: '#9898a8',
                callback: value => '$' + value
              }
            }
          }
        }
      });
    }

    function openFuelLogModal(logId = null) {
      editingFuelLogId = logId;
      
      const modal = document.getElementById('fuel-log-modal');
      const title = document.getElementById('fuel-log-modal-title');
      const vehicleSelect = document.getElementById('fuel-log-vehicle');
      const form = document.getElementById('fuel-log-form');
      
      title.textContent = logId ? 'Edit Fill-Up' : 'Add Fill-Up';
      form.reset();
      document.getElementById('fuel-log-id').value = '';
      
      vehicleSelect.innerHTML = '<option value="">Select a vehicle</option>';
      for (const vehicle of vehicles) {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        vehicleSelect.appendChild(option);
      }
      
      if (!logId) {
        document.getElementById('fuel-log-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('fuel-log-full-tank').checked = true;
        
        if (vehicles.length === 1) {
          vehicleSelect.value = vehicles[0].id;
        }
      } else {
        const log = fuelLogs.find(l => l.id === logId);
        if (log) {
          document.getElementById('fuel-log-id').value = log.id;
          document.getElementById('fuel-log-vehicle').value = log.vehicle_id;
          document.getElementById('fuel-log-date').value = log.date;
          document.getElementById('fuel-log-odometer').value = log.odometer;
          document.getElementById('fuel-log-gallons').value = log.gallons;
          document.getElementById('fuel-log-price').value = log.price_per_gallon;
          document.getElementById('fuel-log-total').value = log.total_cost;
          document.getElementById('fuel-log-type').value = log.fuel_type || 'regular';
          document.getElementById('fuel-log-station').value = log.station_name || '';
          document.getElementById('fuel-log-notes').value = log.notes || '';
          document.getElementById('fuel-log-full-tank').checked = log.is_full_tank !== false;
        }
      }
      
      const gallonsInput = document.getElementById('fuel-log-gallons');
      const priceInput = document.getElementById('fuel-log-price');
      const totalInput = document.getElementById('fuel-log-total');
      
      const calcTotal = () => {
        const gallons = Number.parseFloat(gallonsInput.value) || 0;
        const price = Number.parseFloat(priceInput.value) || 0;
        if (gallons > 0 && price > 0) {
          totalInput.value = (gallons * price).toFixed(2);
        }
      };
      
      gallonsInput.oninput = calcTotal;
      priceInput.oninput = calcTotal;
      
      modal.classList.add('active');
    }

    function closeFuelLogModal() {
      document.getElementById('fuel-log-modal').classList.remove('active');
      editingFuelLogId = null;
    }

    function editFuelLog(logId) {
      openFuelLogModal(logId);
    }

    async function saveFuelLog(event) {
      event.preventDefault();
      
      if (!currentUser) {
        showToast('Please log in to save fuel logs', 'error');
        return;
      }
      
      const logId = document.getElementById('fuel-log-id').value;
      const vehicleId = document.getElementById('fuel-log-vehicle').value;
      const date = document.getElementById('fuel-log-date').value;
      const odometer = document.getElementById('fuel-log-odometer').value;
      const gallons = document.getElementById('fuel-log-gallons').value;
      const pricePerGallon = document.getElementById('fuel-log-price').value;
      const totalCost = document.getElementById('fuel-log-total').value;
      const fuelType = document.getElementById('fuel-log-type').value;
      const stationName = document.getElementById('fuel-log-station').value;
      const notes = document.getElementById('fuel-log-notes').value;
      const isFullTank = document.getElementById('fuel-log-full-tank').checked;
      
      if (!vehicleId || !date || !odometer || !gallons || !pricePerGallon) {
        showToast('Please fill in all required fields', 'error');
        return;
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const payload = {
          vehicle_id: vehicleId,
          date,
          odometer: Number.parseInt(odometer),
          gallons: Number.parseFloat(gallons),
          price_per_gallon: Number.parseFloat(pricePerGallon),
          total_cost: totalCost ? Number.parseFloat(totalCost) : null,
          fuel_type: fuelType,
          station_name: stationName || null,
          notes: notes || null,
          is_full_tank: isFullTank
        };
        
        let url = `/api/member/${currentUser.id}/fuel-log`;
        let method = 'POST';
        
        if (logId) {
          url = `/api/member/${currentUser.id}/fuel-log/${logId}`;
          method = 'PUT';
        }
        
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast(logId ? 'Fill-up updated!' : 'Fill-up added!', 'success');
          closeFuelLogModal();
          loadFuelLogs();
        } else {
          showToast(data.error || 'Failed to save fuel log', 'error');
        }
      } catch (error) {
        console.error('Error saving fuel log:', error);
        showToast('Failed to save fuel log', 'error');
      }
    }

    async function deleteFuelLog(logId) {
      if (!confirm('Are you sure you want to delete this fill-up record?')) {
        return;
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/member/${currentUser.id}/fuel-log/${logId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Fill-up deleted', 'success');
          loadFuelLogs();
        } else {
          showToast(data.error || 'Failed to delete fuel log', 'error');
        }
      } catch (error) {
        console.error('Error deleting fuel log:', error);
        showToast('Failed to delete fuel log', 'error');
      }
    }

    // ========== INSURANCE DOCUMENTS SECTION ==========
    let insuranceDocuments = [];
    let insuranceStats = null;
    let selectedInsuranceFile = null;

    async function loadInsuranceDocuments() {
      if (!currentUser) return;
      
      try {
        const vehicleFilter = document.getElementById('insurance-vehicle-filter')?.value || '';
        let url = `/api/member/${currentUser.id}/insurance-documents`;
        if (vehicleFilter) {
          url += `?vehicle_id=${vehicleFilter}`;
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          insuranceDocuments = data.documents || [];
          insuranceStats = data.stats || {};
          
          updateInsuranceVehicleFilter();
          updateInsuranceStats();
          renderInsuranceDocuments();
        } else {
          console.error('Failed to load insurance documents:', data.error);
        }
      } catch (error) {
        console.error('Error loading insurance documents:', error);
      }
    }

    function updateInsuranceVehicleFilter() {
      const filter = document.getElementById('insurance-vehicle-filter');
      if (!filter) return;
      
      const currentValue = filter.value;
      filter.innerHTML = '<option value="">All Vehicles</option>';
      
      for (const vehicle of vehicles) {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        filter.appendChild(option);
      }
      
      if (currentValue) {
        filter.value = currentValue;
      }
    }

    function updateInsuranceStats() {
      const totalEl = document.getElementById('insurance-total-docs');
      const activeEl = document.getElementById('insurance-active-count');
      const expiringEl = document.getElementById('insurance-expiring-count');
      const expiredEl = document.getElementById('insurance-expired-count');
      
      if (totalEl) totalEl.textContent = insuranceStats.total || 0;
      if (activeEl) activeEl.textContent = insuranceStats.active || 0;
      if (expiringEl) expiringEl.textContent = insuranceStats.expiring_soon || 0;
      if (expiredEl) expiredEl.textContent = insuranceStats.expired || 0;
    }

    function renderInsuranceDocuments() {
      const container = document.getElementById('insurance-documents-list');
      if (!container) return;
      
      if (insuranceDocuments.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:40px;">
            <div class="empty-state-icon">${mccIcon('clipboard-list', 40)}</div>
            <p>No insurance documents yet.</p>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Upload your insurance cards and policy documents to keep them handy.</p>
          </div>
        `;
        return;
      }
      
      const groupedByVehicle = {};
      for (const doc of insuranceDocuments) {
        const vehicleId = doc.vehicle_id;
        if (!groupedByVehicle[vehicleId]) {
          groupedByVehicle[vehicleId] = {
            vehicle: doc.vehicles || {},
            documents: []
          };
        }
        groupedByVehicle[vehicleId].documents.push(doc);
      }
      
      let html = '';
      for (const vehicleId of Object.keys(groupedByVehicle)) {
        const group = groupedByVehicle[vehicleId];
        const vehicleName = group.vehicle.year 
          ? `${group.vehicle.year} ${group.vehicle.make} ${group.vehicle.model}` 
          : 'Unknown Vehicle';
        
        html += `
          <div style="margin-bottom:24px;">
            <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
              <span>${mccIcon('car', 16)}</span> ${vehicleName}
            </h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:12px;">
              ${group.documents.map(doc => renderInsuranceCard(doc)).join('')}
            </div>
          </div>
        `;
      }
      
      container.innerHTML = html;
    }

    function renderInsuranceCard(doc) {
      const docTypeLabel = {
        'insurance_card': 'Insurance Card',
        'policy_declaration': 'Policy Declaration',
        'proof_of_insurance': 'Proof of Insurance'
      };
      
      let statusBadge = '';
      if (doc.is_expired) {
        statusBadge = `<span style="padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(239,95,95,0.15);color:var(--accent-red);">Expired</span>`;
      } else if (doc.is_expiring_soon) {
        statusBadge = `<span style="padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);">Expires in ${doc.days_until_expiry} days</span>`;
      } else if (doc.coverage_end_date) {
        statusBadge = `<span style="padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-green-soft);color:var(--accent-green);">Active</span>`;
      }
      
      const endDateStr = doc.coverage_end_date 
        ? new Date(doc.coverage_end_date).toLocaleDateString() 
        : 'N/A';
      
      const hasFile = doc.storage_path || doc.file_url;
      
      return `
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;transition:all 0.2s;${doc.is_expired ? 'border-left:3px solid var(--accent-red);' : doc.is_expiring_soon ? 'border-left:3px solid var(--accent-orange);' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="font-weight:600;font-size:0.95rem;margin-bottom:4px;">${doc.provider_name}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${docTypeLabel[doc.document_type] || doc.document_type}</div>
            </div>
            ${statusBadge}
          </div>
          
          ${doc.policy_number ? `
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">
              <span style="color:var(--text-muted);">Policy:</span> ${doc.policy_number}
            </div>
          ` : ''}
          
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">
            <span style="color:var(--text-muted);">Expires:</span> ${endDateStr}
          </div>
          
          <div style="display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--border-subtle);">
            ${hasFile ? `
              <button class="btn btn-secondary btn-sm" onclick="downloadInsuranceDocument('${doc.id}')" style="flex:1;">
                ${mccIcon('download', 16)} Download
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="deleteInsuranceDocument('${doc.id}')" style="color:var(--accent-red);" title="Delete">
              ${mccIcon('x', 16)}
            </button>
          </div>
        </div>
      `;
    }

    function openInsuranceDocumentModal() {
      const modal = document.getElementById('insurance-document-modal');
      if (!modal) return;
      
      document.getElementById('insurance-document-form')?.reset();
      selectedInsuranceFile = null;
      
      const filePreview = document.getElementById('insurance-file-preview');
      const dropzone = document.getElementById('insurance-file-dropzone');
      if (filePreview) filePreview.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
      
      const vehicleSelect = document.getElementById('insurance-doc-vehicle');
      if (vehicleSelect) {
        vehicleSelect.innerHTML = '<option value="">Select a vehicle</option>';
        for (const vehicle of vehicles) {
          const option = document.createElement('option');
          option.value = vehicle.id;
          option.textContent = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
          vehicleSelect.appendChild(option);
        }
      }
      
      modal.classList.add('active');
    }

    function closeInsuranceDocumentModal() {
      const modal = document.getElementById('insurance-document-modal');
      if (modal) {
        modal.classList.remove('active');
      }
      selectedInsuranceFile = null;
    }

    function handleInsuranceFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }
      
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Please upload a PDF, JPG, or PNG file', 'error');
        return;
      }
      
      selectedInsuranceFile = file;
      window._pendingInsuranceFile = file;
      
      const dropzone = document.getElementById('insurance-file-dropzone');
      const preview = document.getElementById('insurance-file-preview');
      const fileName = document.getElementById('insurance-file-name');
      const fileSize = document.getElementById('insurance-file-size');
      
      if (dropzone) dropzone.style.display = 'none';
      if (preview) preview.style.display = 'flex';
      if (fileName) fileName.textContent = file.name;
      if (fileSize) fileSize.textContent = formatFileSize(file.size);
      
      const extractArea = document.getElementById('insurance-extract-area');
      const extractionStatus = document.getElementById('insurance-extraction-status');
      if (extractArea) {
        const isImage = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
        extractArea.style.display = isImage ? 'block' : 'none';
      }
      if (extractionStatus) extractionStatus.style.display = 'none';
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function clearInsuranceFile() {
      selectedInsuranceFile = null;
      window._pendingInsuranceFile = null;
      const fileInput = document.getElementById('insurance-file-input');
      const dropzone = document.getElementById('insurance-file-dropzone');
      const preview = document.getElementById('insurance-file-preview');
      const extractArea = document.getElementById('insurance-extract-area');
      const extractionStatus = document.getElementById('insurance-extraction-status');
      
      if (fileInput) fileInput.value = '';
      if (dropzone) dropzone.style.display = 'block';
      if (preview) preview.style.display = 'none';
      if (extractArea) extractArea.style.display = 'none';
      if (extractionStatus) extractionStatus.style.display = 'none';
    }

    async function saveInsuranceDocument(event) {
      event.preventDefault();
      
      const vehicleId = document.getElementById('insurance-doc-vehicle')?.value;
      const documentType = document.getElementById('insurance-doc-type')?.value;
      const providerName = document.getElementById('insurance-doc-provider')?.value;
      const policyNumber = document.getElementById('insurance-doc-policy-number')?.value;
      const startDate = document.getElementById('insurance-doc-start-date')?.value;
      const endDate = document.getElementById('insurance-doc-end-date')?.value;
      
      if (!vehicleId || !providerName) {
        showToast('Please select a vehicle and enter provider name', 'error');
        return;
      }
      
      const submitBtn = document.getElementById('insurance-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        let storagePath = null;
        let fileUrl = null;
        let fileName = null;
        let fileSize = null;
        
        if (window._insurancePreUploadedFile && selectedInsuranceFile) {
          storagePath = window._insurancePreUploadedFile.storagePath;
          fileUrl = window._insurancePreUploadedFile.url;
          fileName = selectedInsuranceFile.name;
          fileSize = selectedInsuranceFile.size;
          window._insurancePreUploadedFile = null;
        } else if (selectedInsuranceFile) {
          const uploadUrlResponse = await fetch(
            `/api/member/${currentUser.id}/insurance-document/upload-url?file_name=${encodeURIComponent(selectedInsuranceFile.name)}&file_type=${encodeURIComponent(selectedInsuranceFile.type)}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token || ''}`
              }
            }
          );
          
          const uploadUrlData = await uploadUrlResponse.json();
          
          if (!uploadUrlData.success) {
            throw new Error(uploadUrlData.error || 'Failed to get upload URL');
          }
          
          const uploadResponse = await fetch(uploadUrlData.upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': selectedInsuranceFile.type
            },
            body: selectedInsuranceFile
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to upload file');
          }
          
          storagePath = uploadUrlData.storage_path;
          fileName = selectedInsuranceFile.name;
          fileSize = selectedInsuranceFile.size;
        }
        
        const docData = {
          vehicle_id: vehicleId,
          document_type: documentType,
          provider_name: providerName,
          policy_number: policyNumber || null,
          coverage_start_date: startDate || null,
          coverage_end_date: endDate || null,
          storage_path: storagePath,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize
        };
        
        const response = await fetch(`/api/member/${currentUser.id}/insurance-document`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(docData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Insurance document saved successfully', 'success');
          closeInsuranceDocumentModal();
          loadInsuranceDocuments();
        } else {
          showToast(data.error || 'Failed to save document', 'error');
        }
      } catch (error) {
        console.error('Error saving insurance document:', error);
        showToast('Failed to save document: ' + error.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Document';
        }
      }
    }

    async function downloadInsuranceDocument(docId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/member/${currentUser.id}/insurance-document/${docId}/download`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (data.success && data.download_url) {
          window.open(data.download_url, '_blank');
        } else {
          showToast(data.error || 'Failed to get download URL', 'error');
        }
      } catch (error) {
        console.error('Error downloading document:', error);
        showToast('Failed to download document', 'error');
      }
    }

    async function deleteInsuranceDocument(docId) {
      if (!confirm('Are you sure you want to delete this insurance document?')) {
        return;
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/member/${currentUser.id}/insurance-document/${docId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Insurance document deleted', 'success');
          loadInsuranceDocuments();
        } else {
          showToast(data.error || 'Failed to delete document', 'error');
        }
      } catch (error) {
        console.error('Error deleting insurance document:', error);
        showToast('Failed to delete document', 'error');
      }
    }

