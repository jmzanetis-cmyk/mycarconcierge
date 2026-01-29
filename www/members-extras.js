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
          <span style="font-size:0.85rem;">📎 ${file.name}</span>
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
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>No notifications yet.</p></div>';
        return;
      }

      const notifIcons = {
        'bid_received': '💰',
        'bid_accepted': '✅',
        'work_started': '🔧',
        'work_completed': '✓',
        'message_received': '💬',
        'payment_released': '💳',
        'upsell_request': '⚠️',
        'reminder': '🔔',
        'default': '📢'
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
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📅</span>
              No appointment scheduled yet. Propose a time to get started.
            </div>
          </div>
        `;
        return;
      }

      const statusColors = {
        'proposed': { bg: 'var(--accent-gold-soft)', color: 'var(--accent-gold)', icon: '⏳' },
        'counter_proposed': { bg: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', icon: '🔄' },
        'confirmed': { bg: 'var(--accent-green-soft)', color: 'var(--accent-green)', icon: '✓' },
        'cancelled': { bg: 'rgba(239, 95, 95, 0.15)', color: 'var(--accent-red)', icon: '✗' }
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
              <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">🕐 ${timeStart} - ${timeEnd}</div>
            </div>
            ${appointment.estimated_days ? `<div style="text-align:right;"><div style="font-size:0.8rem;color:var(--text-muted);">Est. Duration</div><div style="font-weight:600;color:var(--text-primary);">${appointment.estimated_days} day(s)</div></div>` : ''}
          </div>
          ${appointment.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:12px;">"${appointment.notes}"</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${appointment.status === 'proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="confirmScheduleFromMember('${appointment.id}', '${packageId}')">✓ Confirm Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Propose Different Time</button>
            ` : ''}
            ${appointment.status === 'counter_proposed' && proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">✓ Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Counter Again</button>
            ` : ''}
            ${appointment.status === 'proposed' && proposedByMe ? `
              <div style="font-size:0.85rem;color:var(--text-muted);">⏳ Waiting for provider response...</div>
            ` : ''}
            ${appointment.status === 'counter_proposed' && !proposedByMe ? `
              <button class="btn btn-success btn-sm" onclick="acceptCounterProposalFromMember('${appointment.id}', '${packageId}')">✓ Accept New Time</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromMember('${appointment.id}', '${packageId}')">🔄 Counter Again</button>
            ` : ''}
            ${appointment.status === 'confirmed' ? `
              <div style="font-size:0.85rem;color:var(--accent-green);">✓ Appointment confirmed! See you on ${date}.</div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Render transfer status with timeline
    function renderTransferStatus(packageId, transfer) {
      const container = document.getElementById(`transfer-status-${packageId}`);
      if (!container) return;

      if (!transfer) {
        container.innerHTML = `
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px dashed var(--border-subtle);">
            <div style="color:var(--text-muted);font-size:0.9rem;text-align:center;">
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">🚗</span>
              No transfer method set. Configure how your vehicle will be delivered.
            </div>
          </div>
        `;
        return;
      }

      const transferTypes = {
        'member_dropoff': { label: 'Member Drop-off', icon: '🚗', desc: 'You bring the vehicle to the provider' },
        'provider_pickup': { label: 'Provider Pickup', icon: '🚚', desc: 'Provider picks up from your location' },
        'mobile_service': { label: 'Mobile Service', icon: '🔧', desc: 'Service performed at your location' },
        'towing': { label: 'Towing Required', icon: '🚜', desc: 'Vehicle will be towed' }
      };
      const type = transferTypes[transfer.transfer_type] || transferTypes['member_dropoff'];

      const statusSteps = [
        { key: 'pending', label: 'Pending', icon: '⏳' },
        { key: 'scheduled', label: 'Scheduled', icon: '📅' },
        { key: 'in_transit_to_provider', label: 'In Transit', icon: '🚗' },
        { key: 'with_provider', label: 'With Provider', icon: '🔧' },
        { key: 'work_complete', label: 'Work Complete', icon: '✅' },
        { key: 'in_transit_to_member', label: 'Returning', icon: '🏠' },
        { key: 'returned', label: 'Returned', icon: '✓' }
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

          ${transfer.pickup_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">📍 Pickup: ${transfer.pickup_address}</div>` : ''}
          ${transfer.return_address ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">🏠 Return: ${transfer.return_address}</div>` : ''}
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${transfer.vehicle_status === 'pending' || transfer.vehicle_status === 'scheduled' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'pickup')">✓ Confirm Handoff</button>
            ` : ''}
            ${transfer.vehicle_status === 'in_transit_to_member' || transfer.vehicle_status === 'work_complete' ? `
              <button class="btn btn-success btn-sm" onclick="confirmVehicleHandoff('${transfer.id}', '${packageId}', 'return')">✓ Confirm Vehicle Received</button>
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
          'pickup': '🚗 Picking up your vehicle',
          'return': '🚗 Returning your vehicle',
          'in_transit': '🚗 In transit'
        };
        const trackingLabel = trackingTypeLabels[driverLocation.tracking_type] || '🚗 Driver is on the way';
        
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
                    📍 Live Location
                  </div>
                  <div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">
                    ${parseFloat(driverLocation.lat).toFixed(6)}, ${parseFloat(driverLocation.lng).toFixed(6)}
                  </div>
                  ${driverLocation.speed ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">Speed: ${driverLocation.speed} mph</div>` : ''}
                  <div style="font-size:0.8rem;color:var(--text-muted);">Last update: ${updatedAt} on ${updatedDate}</div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;">
                  🗺️ Open Maps
                </a>
              </div>
            </div>
            
            <div style="text-align:center;">
              <div style="display:inline-block;padding:8px 16px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
                <iframe 
                  src="https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(driverLocation.lng) - 0.01},${parseFloat(driverLocation.lat) - 0.01},${parseFloat(driverLocation.lng) + 0.01},${parseFloat(driverLocation.lat) + 0.01}&layer=mapnik&marker=${driverLocation.lat},${driverLocation.lng}" 
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
                  ${isFromMe ? '📍 Your Shared Location' : '📍 Provider Location (One-time)'}
                </div>
                ${locationShare.address ? `<div style="font-size:0.95rem;color:var(--text-primary);margin-bottom:4px;">${locationShare.address}</div>` : ''}
                <div style="font-size:0.8rem;color:var(--text-muted);">Shared: ${sharedAt}</div>
                ${locationShare.message ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">"${locationShare.message}"</div>` : ''}
              </div>
              <a href="${mapsUrl}" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration:none;">
                🗺️ Open Maps
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
      'pre_pickup': { label: 'Pre-Pickup Condition', icon: '🔵', color: 'var(--accent-blue)' },
      'arrival_shop': { label: 'Arrival at Shop', icon: '🟠', color: '#f59e0b' },
      'post_service': { label: 'Post-Service Condition', icon: '🟢', color: 'var(--accent-green)' },
      'return': { label: 'Vehicle Return', icon: '🟣', color: '#a855f7' }
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
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📸</span>
                No evidence captured yet. Document your vehicle condition before pickup.
              </div>
            </div>
          `;
          return;
        }

        const timeline = evidence.map(e => {
          const typeInfo = memberEvidenceTypeLabels[e.type] || { label: e.type, icon: '📷', color: 'var(--text-muted)' };
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
                  <span>🔢 ${e.odometer?.toLocaleString() || 'N/A'} mi</span>
                  <span>⛽ ${e.fuel_level || 'N/A'}</span>
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
                <span style="font-size:1.5rem;display:block;margin-bottom:8px;">🔑</span>
                No key exchanges recorded yet. The provider will document key handoffs at pickup and return.
              </div>
            </div>
          `;
          return;
        }

        const stageInfo = {
          'pickup': { label: 'Pickup Key Exchange', icon: '🔵', color: 'var(--accent-blue)' },
          'return': { label: 'Return Key Exchange', icon: '🟣', color: '#a855f7' }
        };

        const timeline = keyExchanges.map(exchange => {
          const info = stageInfo[exchange.stage] || { label: exchange.stage, icon: '🔑', color: 'var(--text-muted)' };
          
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
                    ${exchange.verified_at ? `<span style="background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;">✓ Verified</span>` : ''}
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
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📤 Uploading photos...</p>';

      try {
        const photoUrls = await window.uploadEvidencePhotos(packageId, files);
        if (photoUrls.length === 0) {
          throw new Error('Failed to upload photos');
        }

        statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📝 Saving evidence...</p>';

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
          odometer: parseInt(odometer),
          fuelLevel,
          exteriorCondition,
          interiorCondition,
          notes,
          role: 'member',
          lat,
          lng
        });

        if (error) throw error;

        statusDiv.innerHTML = '<p style="color:var(--accent-green);">✅ Evidence saved successfully!</p>';
        showToast('Vehicle condition documented!', 'success');

        setTimeout(() => {
          closeModal('member-evidence-modal');
          loadEvidenceTimeline(packageId);
        }, 1500);
      } catch (err) {
        console.error('Evidence submission error:', err);
        statusDiv.innerHTML = `<p style="color:var(--accent-red);">❌ Error: ${err.message || 'Failed to save evidence'}</p>`;
        showToast('Failed to save evidence', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '📸 Save Evidence';
      }
    }

    // Open schedule modal
    function openScheduleModal(packageId, memberId, providerId) {
      currentLogisticsContext = { packageId, memberId, providerId };
      document.getElementById('schedule-package-id').value = packageId;
      document.getElementById('schedule-member-id').value = memberId;
      document.getElementById('schedule-provider-id').value = providerId;
      
      // Set minimum date to today
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('schedule-date').min = today;
      document.getElementById('schedule-date').value = '';
      document.getElementById('schedule-time-start').value = '09:00';
      document.getElementById('schedule-time-end').value = '17:00';
      document.getElementById('schedule-duration').value = '1';
      document.getElementById('schedule-notes').value = '';
      
      openModal('schedule-modal');
    }

    // Submit schedule proposal
    async function submitScheduleProposal() {
      const packageId = document.getElementById('schedule-package-id').value;
      const memberId = document.getElementById('schedule-member-id').value;
      const providerId = document.getElementById('schedule-provider-id').value;
      const date = document.getElementById('schedule-date').value;
      const timeStart = document.getElementById('schedule-time-start').value;
      const timeEnd = document.getElementById('schedule-time-end').value;
      const duration = parseInt(document.getElementById('schedule-duration').value) || 1;
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
            <div style="font-size:48px;margin-bottom:12px;">📍</div>
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
              🗺️ Open in Google Maps
            </a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}" target="_blank" class="btn btn-secondary" style="justify-content:center;text-decoration:none;">
              🚗 Get Directions
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
          document.getElementById('emergency-location-text').textContent = '📍 Location captured';
          
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
          document.getElementById('emergency-location-text').textContent = '⚠️ Could not get location';
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
      lockout: { base: 100, perMile: 0, includedMiles: 0, display: '🔐 Lockout' },
      dead_battery: { base: 100, perMile: 0, includedMiles: 0, display: '🔋 Jump Start' },
      flat_tire: { base: 125, perMile: 0, includedMiles: 0, display: '🛞 Flat Tire' },
      fuel_delivery: { base: 125, perMile: 0, includedMiles: 0, display: '⛽ Fuel Delivery' },
      tow_needed: { base: 200, perMile: 6, includedMiles: 10, display: '🚛 Towing' },
      accident: { base: 250, perMile: 6, includedMiles: 10, display: '💥 Accident' },
      other: { base: 150, perMile: 0, includedMiles: 0, display: '🔧 Other' }
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
      
      const miles = parseFloat(document.getElementById('emergency-tow-miles').value) || 10;
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
      const estimatedMiles = needsDistance ? (parseFloat(document.getElementById('emergency-tow-miles').value) || 10) : null;
      const escrowAmount = calculateEmergencyEscrow(emergencyType, estimatedMiles || 10);
      const totalAmount = EMERGENCY_ACTIVATION_FEE + escrowAmount;
      
      pendingEmergencyPaymentData = {
        vehicleId: vehicleId || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
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
        showToast('🚨 Emergency request submitted! Providers are being notified.', 'success');
        
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
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      document.getElementById('emergency-active-type').textContent = typeLabels[e.emergency_type] || e.emergency_type;
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: '⏳', label: 'Waiting for provider' },
        'accepted': { icon: '✓', label: 'Provider accepted' },
        'en_route': { icon: '🚗', label: 'Provider en route' },
        'arrived': { icon: '📍', label: 'Provider arrived' },
        'in_progress': { icon: '🔧', label: 'Work in progress' },
        'completed': { icon: '✅', label: 'Completed' }
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
            <div style="font-weight:600;color:var(--accent-orange);margin-bottom:4px;">🔍 Round ${currentRound} of 3</div>
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
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:8px;width:100%;justify-content:center;">📞 Call Provider</a>` : ''}
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
            <div class="empty-state-icon">🆘</div>
            <p>No emergency requests yet.</p>
          </div>
        `;
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
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      const statuses = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'];
      const currentIdx = statuses.indexOf(e.status);
      
      const statusLabels = {
        'pending': { icon: '⏳', label: 'Waiting for provider' },
        'accepted': { icon: '✓', label: 'Provider accepted' },
        'en_route': { icon: '🚗', label: 'Provider en route' },
        'arrived': { icon: '📍', label: 'Provider arrived' },
        'in_progress': { icon: '🔧', label: 'Work in progress' },
        'completed': { icon: '✅', label: 'Completed' }
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
          ${e.provider.phone ? `<a href="tel:${e.provider.phone}" class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center;">📞 Call Provider</a>` : ''}
          ${e.eta_minutes ? `<div style="color:var(--accent-gold);margin-top:12px;">ETA: ${e.eta_minutes} minutes</div>` : ''}
        </div>
      ` : '';
      
      const vehicleName = e.vehicles ? `${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}` : 'No vehicle selected';
      
      document.getElementById('emergency-status-content').innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:32px;margin-bottom:8px;">${typeLabels[e.emergency_type]?.split(' ')[0] || '🚨'}</div>
          <div style="font-size:1.1rem;font-weight:600;">${typeLabels[e.emergency_type] || e.emergency_type}</div>
          <div style="color:var(--text-muted);font-size:0.9rem;">${vehicleName}</div>
        </div>
        
        <div class="emergency-timeline">${timelineHtml}</div>
        
        ${providerHtml}
        
        ${e.address ? `
          <div style="margin-top:20px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">📍 Your Location</div>
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
          <div style="font-size:48px;margin-bottom:16px;">😔</div>
          <h3 style="margin-bottom:12px;color:var(--accent-red);">No Providers Available</h3>
          <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.6;">
            We're sorry, but no providers were able to respond to your emergency request after 15 minutes of searching.
          </p>
          <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:24px;">
            <p style="font-weight:600;margin-bottom:8px;">Alternative Help:</p>
            <p style="color:var(--text-secondary);margin-bottom:12px;">Please try calling 911 or a local towing service.</p>
            <a href="tel:911" class="btn btn-danger" style="width:100%;justify-content:center;margin-bottom:8px;">📞 Call 911</a>
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
              <span style="font-size:1.5rem;display:block;margin-bottom:8px;">📋</span>
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
          name: '🛢️ Fluids', 
          items: [
            { label: 'Engine Oil', field: 'engine_oil' },
            { label: 'Transmission Fluid', field: 'transmission_fluid' },
            { label: 'Coolant Level', field: 'coolant_level' },
            { label: 'Brake Fluid', field: 'brake_fluid' },
            { label: 'Power Steering Fluid', field: 'power_steering_fluid' }
          ]
        },
        { 
          name: '🛞 Brakes', 
          items: [
            { label: 'Front Brake Pads', field: 'brake_pads_front', extra: inspection.brake_pads_front_percent ? `${inspection.brake_pads_front_percent}%` : null },
            { label: 'Rear Brake Pads', field: 'brake_pads_rear', extra: inspection.brake_pads_rear_percent ? `${inspection.brake_pads_rear_percent}%` : null },
            { label: 'Brake Rotors', field: 'brake_rotors' }
          ]
        },
        { 
          name: '🚗 Tires', 
          items: [
            { label: 'Front Left', field: 'tire_front_left', extra: inspection.tire_front_left_tread ? `${inspection.tire_front_left_tread}/32"` : null },
            { label: 'Front Right', field: 'tire_front_right', extra: inspection.tire_front_right_tread ? `${inspection.tire_front_right_tread}/32"` : null },
            { label: 'Rear Left', field: 'tire_rear_left', extra: inspection.tire_rear_left_tread ? `${inspection.tire_rear_left_tread}/32"` : null },
            { label: 'Rear Right', field: 'tire_rear_right', extra: inspection.tire_rear_right_tread ? `${inspection.tire_rear_right_tread}/32"` : null },
            { label: 'Spare Tire', field: 'spare_tire' }
          ]
        },
        { 
          name: '⚡ Electrical & Lights', 
          items: [
            { label: 'Battery', field: 'battery', extra: inspection.battery_voltage ? `${inspection.battery_voltage}V` : null },
            { label: 'Headlights', field: 'headlights' },
            { label: 'Taillights', field: 'taillights' },
            { label: 'Turn Signals', field: 'turn_signals' }
          ]
        },
        { 
          name: '🔗 Belts & Hoses', 
          items: [
            { label: 'Serpentine Belt', field: 'serpentine_belt' },
            { label: 'Hoses', field: 'hoses' }
          ]
        },
        { 
          name: '🌧️ Wipers & Glass', 
          items: [
            { label: 'Wiper Blades', field: 'wiper_blades' },
            { label: 'Windshield', field: 'windshield' }
          ]
        },
        { 
          name: '🔧 Suspension & Steering', 
          items: [
            { label: 'Shocks/Struts', field: 'shocks_struts' },
            { label: 'Alignment', field: 'alignment' }
          ]
        },
        { 
          name: '🌬️ Filters', 
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
              <span style="font-size:0.8rem;color:var(--text-muted);">▼</span>
            </div>
            <div class="inspection-category-items">${itemsHtml}</div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = `
        <div class="inspection-report-header">
          <div>
            <span class="inspection-overall-badge ${inspection.overall_condition}">${conditionLabels[inspection.overall_condition] || 'N/A'}</span>
            <div class="inspection-date" style="margin-top:8px;">📅 Inspected: ${inspectionDate}</div>
          </div>
        </div>
        
        <div class="inspection-counts">
          ${inspection.urgent_items > 0 ? `<div class="inspection-count-item urgent">🔴 ${inspection.urgent_items} Urgent</div>` : ''}
          ${inspection.attention_items > 0 ? `<div class="inspection-count-item attention">🟠 ${inspection.attention_items} Need Attention</div>` : ''}
          ${!inspection.urgent_items && !inspection.attention_items ? `<div class="inspection-count-item good">✅ All items in good condition</div>` : ''}
        </div>
        
        ${categoriesHtml}
        
        ${inspection.recommendations ? `
          <div class="inspection-recommendations">
            <div class="inspection-recommendations-title">💡 Provider Recommendations</div>
            <div class="inspection-recommendations-text">${inspection.recommendations}</div>
          </div>
        ` : ''}
        
        ${inspection.technician_notes ? `
          <div class="inspection-recommendations" style="margin-top:12px;">
            <div class="inspection-recommendations-title">📝 Technician Notes</div>
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
              <div style="position:absolute;top:-8px;left:16px;background:var(--accent-gold);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;">📨 INVITATION</div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-top:8px;">
                <div style="flex:1;min-width:200px;">
                  <div style="font-size:1.1rem;font-weight:600;margin-bottom:6px;">${inv.household?.name || 'Household'}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span style="font-size:0.85rem;color:var(--text-secondary);">Invited by <strong>${inv.household?.owner?.full_name || 'Owner'}</strong></span>
                    <span style="padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:var(--accent-blue-soft);color:var(--accent-blue);">${roleLabels[inv.role] || 'Member'} Role</span>
                  </div>
                </div>
                <div style="display:flex;gap:10px;">
                  <button class="btn btn-primary" onclick="acceptInvitation('${inv.id}')" style="padding:10px 20px;">✓ Accept</button>
                  <button class="btn btn-secondary" onclick="declineInvitation('${inv.id}')" style="padding:10px 20px;">✗ Decline</button>
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
      document.getElementById('household-member-count-badge').textContent = `👥 ${memberCount} member${memberCount !== 1 ? 's' : ''}`;
      
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
            <div style="position:absolute;top:-8px;right:16px;background:linear-gradient(135deg, var(--accent-gold), #e8bc5a);color:#0a0a0f;padding:2px 10px;border-radius:100px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">👑 Owner</div>
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
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">📝 Can Request</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">✓ Can Approve</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">🔓 Full Access</span>
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
        if (perms.can_request_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-blue-soft);color:var(--accent-blue);">📝 Can Request</span>');
        if (perms.can_approve_services) permsBadges.push('<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-green-soft);color:var(--accent-green);">✓ Can Approve</span>');
        if (perms.spending_limit) permsBadges.push(`<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;background:var(--accent-gold-soft);color:var(--accent-gold);">💰 $${perms.spending_limit} limit</span>`);
        
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
      
      grid.innerHTML = membersHtml || '<div class="empty-state" style="grid-column:1/-1;padding:32px;"><div class="empty-state-icon">👥</div><p>No members yet.</p></div>';
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
              <div style="width:40px;height:40px;background:var(--accent-orange-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-orange);">📧</div>
              <div style="flex:1;">
                <div style="font-weight:500;margin-bottom:4px;">${inv.email}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:var(--accent-orange-soft);color:var(--accent-orange);">⏳ Pending</span>
                  <span style="padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:500;background:${roleColor}22;color:${roleColor};">${roleLabels[role] || 'Member'}</span>
                </div>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="cancelInvitation('${inv.id}')" title="Cancel invitation">✕ Cancel</button>
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
        vehicleCountBadge.textContent = `🚗 ${householdVehicles.length} vehicle${householdVehicles.length !== 1 ? 's' : ''}`;
      }
      
      renderHouseholdVehicles();
    }

    function renderHouseholdVehicles() {
      const grid = document.getElementById('household-vehicles-grid');
      
      if (householdVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:32px;">
            <div class="empty-state-icon">🚗</div>
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
          actionButtons = `<span style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">👁️ View Only</span>`;
        }
        
        return `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden;transition:all 0.2s;" class="household-vehicle-card">
            <div style="height:140px;background:linear-gradient(135deg, rgba(74,124,255,0.1), rgba(212,168,85,0.1));display:flex;align-items:center;justify-content:center;font-size:56px;position:relative;">
              🚗
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
          parseFloat(document.getElementById('invite-spending-limit').value) : null
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
          parseFloat(document.getElementById('manage-spending-limit').value) : null
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
              <div class="empty-state-icon">📊</div>
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
              <div class="empty-state-icon">📊</div>
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
                  <span style="color:var(--accent-gold);">📦</span> ${item.title}
                </div>
                <div style="display:flex;align-items:center;gap:12px;font-size:0.82rem;color:var(--text-muted);">
                  <span>🚗 ${vehicleName}</span>
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
            <div class="empty-state-icon">⚠️</div>
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
        document.getElementById('fleet-billing-email-display').innerHTML = data.billing_email ? `📧 ${data.billing_email}` : '';
        document.getElementById('fleet-address-display').innerHTML = data.address ? `📍 ${data.address}` : '';
        const taxIdEl = document.getElementById('fleet-tax-id-display');
        if (taxIdEl) taxIdEl.innerHTML = data.tax_id ? `🏛️ Tax ID: ${data.tax_id}` : '';
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
            <div class="empty-state-icon">✅</div>
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
                  <span>👤 ${requesterName}</span>
                  ${pkg.estimated_cost ? `<span>💰 ~$${Number(pkg.estimated_cost).toLocaleString()}</span>` : ''}
                  <span>📅 ${new Date(pkg.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-success btn-sm" onclick="approveFleetServiceRequest('${pkg.id}')">✓ Approve</button>
                <button class="btn btn-danger btn-sm" onclick="rejectFleetServiceRequest('${pkg.id}')">✕ Reject</button>
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
              <div style="font-size:32px;margin-bottom:8px;">👥</div>
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
                ? '<span class="approval-indicator">⚠️ Required</span>' 
                : '<span class="approval-indicator no-approval">✓ Auto</span>'}
            </td>
            <td><span class="fleet-status-badge ${status}">${status}</span></td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="openEditFleetEmployee('${member.id}')" title="Edit">✏️</button>
                ${status === 'active' 
                  ? `<button class="btn btn-ghost btn-sm" onclick="suspendFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Suspend" style="color:var(--accent-orange);">⏸️</button>`
                  : `<button class="btn btn-ghost btn-sm" onclick="activateFleetMember('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Activate" style="color:var(--accent-green);">▶️</button>`
                }
                <button class="btn btn-ghost btn-sm" onclick="confirmRemoveFleetEmployee('${member.id}', '${name.replace(/'/g, "\\'")}')" title="Remove" style="color:var(--accent-red);">🗑️</button>
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
            <div class="empty-state-icon">🚗</div>
            <p>No vehicles in fleet yet.</p>
            <button class="btn btn-primary btn-sm" onclick="openAddFleetVehicleModal()" style="margin-top:12px;">+ Add First Vehicle</button>
          </div>
        `;
        return;
      }
      
      if (filteredVehicles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:24px;">
            <div class="empty-state-icon">🔍</div>
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
                : '🚗'}
              <span class="fleet-assignment-badge ${assignment}" style="position:absolute;top:8px;right:8px;">${assignment}</span>
              ${needsService ? `<span class="fleet-assignment-badge" style="position:absolute;top:8px;left:8px;background:rgba(239,95,95,0.9);color:#fff;">⚠️ Needs Service</span>` : ''}
            </div>
            <div class="fleet-vehicle-body">
              <div class="fleet-vehicle-title">${v.year || ''} ${v.make || ''} ${v.model || ''}</div>
              <div class="fleet-vehicle-driver">👤 ${driverName}</div>
              <div class="fleet-vehicle-meta">
                ${fv.department ? `<span style="font-size:0.78rem;color:var(--text-muted);">📁 ${fv.department}</span>` : ''}
                <span class="fleet-status-badge ${healthStatus === 'excellent' || healthStatus === 'good' ? 'active' : healthStatus === 'fair' ? 'pending' : 'inactive'}" style="font-size:0.7rem;">${healthStatus}</span>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openEditFleetVehicle('${fv.id}')">✏️ Edit</button>
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
            <div class="empty-state-icon">📅</div>
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
              <span>🚗 ${vehicleCount} vehicle${vehicleCount !== 1 ? 's' : ''}</span>
              <span>📅 ${formatDateRange(batch.start_date, batch.end_date)}</span>
              ${batch.total_estimated_cost ? `<span>💰 ~$${Number(batch.total_estimated_cost).toLocaleString()}</span>` : ''}
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
            ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '🚗'}
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
              ${v.photo_url ? `<img src="${v.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : '🚗'}
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
          <h4 style="margin-bottom:12px;">📋 Batch Details</h4>
          <div style="display:grid;gap:8px;font-size:0.9rem;">
            <div><strong>Title:</strong> ${title}</div>
            <div><strong>Service Type:</strong> ${serviceType}</div>
            <div><strong>Date Range:</strong> ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</div>
            ${description ? `<div><strong>Description:</strong> ${description}</div>` : ''}
          </div>
        </div>
        
        <div class="card">
          <h4 style="margin-bottom:12px;">🚗 Vehicles (${bulkSelectedVehicles.length})</h4>
          ${vehiclesList}
        </div>
        
        <div style="margin-top:16px;padding:16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
          <strong style="color:var(--accent-gold);">ℹ️ What happens next:</strong>
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
        const total = parseFloat(payment.amount) || 0;
        const bid = payment.bids || {};
        const pkg = payment.packages || {};
        
        const platformFee = total * 0.075;
        const parts = parseFloat(bid.parts_cost) || 0;
        const labor = parseFloat(bid.labor_cost) || 0;
        const taxes = parseFloat(bid.tax_amount) || (total * 0.08);
        const isTowing = pkg.transfer_type === 'towing' || parseFloat(bid.towing_cost) > 0;
        const towing = parseFloat(bid.towing_cost) || (isTowing ? total * 0.15 : 0);
        
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
        const stepNum = parseInt(step.dataset.step);
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
          div.innerHTML = '<div class="va-audio-icon">🎵</div>';
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
        
        const response = await fetch('/api/diagnostics/generate', {
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
        low: '✅ Low Priority',
        medium: '⚠️ Medium Priority',
        high: '🔶 High Priority',
        critical: '🚨 Critical - Address Immediately',
        cosmetic: '✨ Cosmetic Work'
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
        { title: 'Why Oil Changes Matter', content: 'Oil lubricates your engine\'s moving parts and removes heat. Old oil breaks down and can\'t protect your engine, leading to wear and expensive repairs. Most modern cars need synthetic oil every 5,000-10,000 miles.', icon: '🛢️' },
        { title: 'Brake Basics', content: 'Brakes work by pressing pads against spinning rotors to slow your car. Brake pads wear down over time and need replacement every 30,000-70,000 miles. Squealing usually means pads are getting low.', icon: '🛑' },
        { title: 'Tire Care Essentials', content: 'Tires are your only contact with the road. Rotate them every 5,000-7,500 miles for even wear. Check pressure monthly - underinflated tires waste gas and wear faster.', icon: '🔄' },
        { title: 'Battery Health', content: 'Car batteries typically last 3-5 years. Extreme heat and cold shorten their life. Signs of a dying battery: slow engine crank, dim lights, and dashboard warning lights.', icon: '🔋' },
        { title: 'Fluid Check Guide', content: 'Your car uses several fluids: engine oil, coolant, brake fluid, transmission fluid, and power steering fluid. Most have dipsticks or reservoirs you can check yourself.', icon: '💧' },
        { title: 'Filter Fundamentals', content: 'Air filters keep dust out of your engine (replace every 15,000-30,000 miles). Cabin filters keep the air you breathe clean (replace every 15,000-25,000 miles).', icon: '💨' }
      ],
      repairs: [
        { title: 'Alternator vs Battery', content: 'If your car won\'t start, it could be either. A dead battery is more common. If you jump-start and it dies again quickly, the alternator (which charges the battery) may be failing.', icon: '⚡' },
        { title: 'Suspension & Shocks', content: 'Suspension keeps your ride smooth and your tires on the road. Signs of worn shocks: bouncy ride, nose-diving when braking, uneven tire wear.', icon: '🚗' },
        { title: 'Transmission Explained', content: 'The transmission transfers power from engine to wheels and changes gears. Automatic transmissions shift for you; manuals require clutch work. Fluid changes extend transmission life.', icon: '⚙️' },
        { title: 'Timing Belt vs Chain', content: 'Timing belts are rubber and need replacement (60,000-100,000 miles). Timing chains are metal and usually last the life of the engine. Check your owner\'s manual.', icon: '🔗' },
        { title: 'Catalytic Converter', content: 'This emissions device converts harmful gases into less harmful ones. They\'re expensive because they contain precious metals. Theft is common - consider a protective shield.', icon: '🌿' },
        { title: 'CV Joints & Axles', content: 'CV (constant velocity) joints allow your wheels to turn while receiving power. Clicking sounds when turning often indicate worn CV joints. The rubber boots protect them from dirt.', icon: '🔘' }
      ],
      warningSigns: [
        { title: 'Squealing Brakes', content: 'A high-pitched squeal usually means brake pads are worn. Built-in wear indicators make this sound on purpose. Don\'t ignore it - metal-on-metal grinding is much more expensive to fix.', icon: '🔊', severity: 'medium' },
        { title: 'Check Engine Light', content: 'This can mean anything from a loose gas cap to a serious engine problem. A steady light means get it checked soon. A flashing light means pull over - continued driving may cause damage.', icon: '🚨', severity: 'high' },
        { title: 'Burning Smell', content: 'Different burns mean different problems: Sweet smell = coolant leak. Burning oil = oil leak onto hot engine. Burning rubber = belt slipping or stuck brake. Electrical = wiring issue.', icon: '👃', severity: 'high' },
        { title: 'Vibrations', content: 'Steering wheel shake at highway speeds often means unbalanced or worn tires. Vibration when braking suggests warped rotors. General vibration could be engine mounts or drivetrain.', icon: '📳', severity: 'medium' },
        { title: 'Pulling to One Side', content: 'If your car drifts left or right, it could be alignment, uneven tire pressure, or worn suspension. Start by checking tire pressure - it\'s the easiest fix.', icon: '↔️', severity: 'low' },
        { title: 'Strange Noises', content: 'Clicking when turning = CV joint. Grinding = brakes or transmission. Knocking from engine = low oil or engine damage. Hissing = vacuum or coolant leak. Clunking over bumps = suspension.', icon: '👂', severity: 'medium' }
      ],
      savingTips: [
        { title: 'Get Multiple Quotes', content: 'For any repair over $300, get 2-3 quotes. Prices can vary significantly. My Car Concierge makes this easy with competitive bidding from verified providers.', icon: '📊' },
        { title: 'Don\'t Skip Maintenance', content: 'Regular oil changes and inspections catch small problems before they become big ones. A $50 oil change prevents a $5,000 engine replacement.', icon: '📅' },
        { title: 'Understand the Diagnosis', content: 'Ask your mechanic to explain what\'s wrong in plain language. A good provider will show you the worn parts and explain why repairs are needed.', icon: '🔍' },
        { title: 'Know What\'s Urgent', content: 'Brakes, tires, steering = safety-critical, fix immediately. Oil leak = fix soon. Cosmetic issues = can wait. Don\'t let shops scare you into unnecessary rush jobs.', icon: '⏰' },
        { title: 'OEM vs Aftermarket Parts', content: 'OEM (Original Equipment Manufacturer) parts are made by your car\'s brand. Aftermarket parts are often cheaper and work fine, but quality varies. For critical components, OEM may be worth it.', icon: '🏭' },
        { title: 'DIY What You Can', content: 'Some things are easy to do yourself: wiper blades, air filters, tire pressure, washer fluid. YouTube tutorials make it simple. Save labor costs for complex repairs.', icon: '🛠️' }
      ],
      rideshare: [
        { title: 'Accelerated Maintenance Schedules', content: 'When you drive 30,000-50,000+ miles per year, standard maintenance intervals don\'t apply. Your oil changes may need to happen every 3,000-5,000 miles instead of 7,500. Brake pads might last only 20,000 miles with constant city stop-and-go. Create a mileage-based schedule and track everything - your car is your business asset.', icon: '📅', readTime: '3 min' },
        { title: 'City Driving Wear Patterns', content: 'Stop-and-go traffic is the hardest on your vehicle. Brakes wear 2-3x faster than highway driving. Transmission fluid degrades faster from constant gear changes. Your cooling system works harder in traffic. Engine mounts and suspension take a beating from potholes. Understanding these patterns helps you budget for repairs.', icon: '🏙️', readTime: '3 min' },
        { title: 'Cost-Per-Mile Calculations', content: 'Knowing your true cost per mile helps you understand profitability. Include: fuel, insurance, maintenance, repairs, depreciation, and car washes. Most drivers underestimate true costs. Track all expenses for accurate calculations. A well-maintained vehicle has lower cost-per-mile than one driven to failure.', icon: '💵', readTime: '4 min' },
        { title: 'Tax Deduction Essentials', content: 'Vehicle expenses for business driving may be tax-deductible. Keep detailed mileage logs with dates, destinations, and purpose. Save all receipts for repairs, maintenance, fuel, and car washes. Consult a tax professional about standard mileage rate vs actual expenses method. Good records can save you thousands.', icon: '📋', readTime: '3 min' },
        { title: 'Protecting Resale Value', content: 'High-mileage vehicles depreciate faster, but you can minimize the hit. Keep detailed maintenance records - they\'re worth money at resale. Address cosmetic issues promptly. Consider professional detailing before selling. Timing matters - selling at 100K miles gets better value than 150K. Plan your exit strategy.', icon: '💰', readTime: '3 min' },
        { title: 'Passenger Comfort & Safety', content: 'Happy passengers mean better ratings and tips. Keep your cabin air filter fresh for clean air. Ensure AC works well year-round. Check that all seat belts function properly. Keep the interior clean and odor-free. Working USB ports and phone mounts show professionalism. First impressions matter.', icon: '⭐', readTime: '3 min' }
      ],
      commercial: [
        { title: 'Heavy-Duty Brake Systems', content: 'Larger vehicles with passengers or cargo need more stopping power. Brake systems work much harder than passenger cars. Inspect brake pads, rotors, and drums more frequently. Listen for squealing or grinding - address immediately. Air brake systems require additional maintenance. Never compromise on brakes when carrying passengers.', icon: '🛑', readTime: '4 min' },
        { title: 'Transmission Care for Heavy Loads', content: 'Transmissions in vans and buses work harder due to weight. Use the correct transmission fluid specified for your vehicle. Consider more frequent fluid changes - every 30,000 miles for heavy use. Avoid overloading - it accelerates wear dramatically. Towing or carrying maximum loads? Expect shorter component life.', icon: '⚙️', readTime: '4 min' },
        { title: 'Pre-Trip Inspection Basics', content: 'Professional drivers should inspect their vehicle before each trip. Check tires for pressure and damage. Test all lights - headlights, brake lights, turn signals. Verify horn works. Check mirrors for proper adjustment. Look under the vehicle for leaks. Test brakes before leaving. This protects you and your passengers.', icon: '✅', readTime: '4 min' },
        { title: 'Cooling System Demands', content: 'Engines in commercial vehicles run hotter due to constant operation and heavier loads. Check coolant levels regularly. Inspect belts and hoses for wear. Watch your temperature gauge - overheating destroys engines. Consider a heavy-duty radiator if you frequently operate at capacity. Don\'t ignore warning signs.', icon: '🌡️', readTime: '3 min' },
        { title: 'Suspension & Steering Under Load', content: 'Heavy loads stress suspension components. Inspect shocks and struts for leaks or wear. Check ball joints and tie rod ends regularly. Listen for clunks over bumps - address immediately. Proper alignment extends tire life and improves handling. Worn suspension affects braking distance and safety.', icon: '🔧', readTime: '3 min' },
        { title: 'Fleet Maintenance Records', content: 'Proper documentation is essential for commercial vehicles. Track all maintenance by date and mileage. Record fuel consumption to spot problems early. Keep repair receipts organized. Many jurisdictions require maintenance logs for commercial vehicles. Good records also help with resale and warranty claims.', icon: '📁', readTime: '3 min' }
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
      maintenance101: { title: 'Maintenance 101', icon: '🔧', desc: 'Understanding routine maintenance' },
      repairs: { title: 'Understanding Repairs', icon: '🔩', desc: 'What mechanics mean when they say...' },
      warningSigns: { title: 'Warning Signs', icon: '⚠️', desc: 'Sounds, smells, and symptoms to watch for' },
      savingTips: { title: 'Money-Saving Tips', icon: '💰', desc: 'How to save on car care' },
      rideshare: { title: 'Rideshare & High-Mileage Drivers', icon: '🚗', desc: 'Tips for drivers who put serious miles on their vehicles' },
      commercial: { title: 'Commercial & Fleet Vehicles', icon: '🚐', desc: 'Maintenance for vans, buses, and commercial transport' }
    };

    let currentLearnCategory = null;
    let currentGlossaryFilter = '';

    function renderLearnHub() {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
      categoriesContainer.style.display = 'grid';
      articlesView.style.display = 'none';
      currentLearnCategory = null;
      
      renderGlossary('');
    }

    function showLearnCategory(category) {
      const categoriesContainer = document.getElementById('learn-categories');
      const articlesView = document.getElementById('learn-articles-view');
      
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
              ${severityBadge}
              <span class="learn-article-expand">▼</span>
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
            <div class="empty-state-icon">🔍</div>
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

    // Initialize Learn section when shown
    const originalShowSection = showSection;
    showSection = function(sectionId) {
      originalShowSection(sectionId);
      if (sectionId === 'learn') {
        renderLearnHub();
      }
      if (sectionId === 'settings') {
        load2FAStatus();
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
            <div class="empty-state-icon">🤖</div>
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
                  <span>📅 Last searched: ${lastSearched}</span>
                  <span>🎯 Matches: ${matchCount}</span>
                  <span>🔄 ${search.search_frequency === 'hourly' ? 'Every hour' : search.search_frequency === 'twice_daily' ? 'Twice daily' : 'Daily'}</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary" onclick="viewSearchMatches('${search.id}')">
                  🎯 View Matches
                </button>
                <button class="btn btn-sm btn-secondary" onclick="editDreamCarSearch('${search.id}')">
                  ✏️ Edit
                </button>
                <button class="btn btn-sm btn-secondary" onclick="toggleSearchActive('${search.id}')">
                  ${search.is_active ? '⏸️ Pause' : '▶️ Resume'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDreamCarSearch('${search.id}')">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderDreamCarMatches() {
      const grid = document.getElementById('ai-matches-grid');
      const filter = document.getElementById('ai-matches-filter').value;
      
      let filtered = dreamCarMatches;
      if (filter === 'unseen') {
        filtered = dreamCarMatches.filter(m => !m.is_seen);
      } else if (filter === 'saved') {
        filtered = dreamCarMatches.filter(m => m.is_saved);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px; grid-column: 1 / -1;">
            <div class="empty-state-icon">🚗</div>
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
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" onerror="this.parentNode.innerHTML='<div class=\\'vehicle-emoji\\'>🚗</div>'">` : '<div class="vehicle-emoji">🚗</div>'}
              <div style="position: absolute; top: 12px; right: 12px; padding: 6px 12px; border-radius: 100px; font-size: 0.8rem; font-weight: 600; background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}88); color: white;">
                ${match.match_score || 0}% Match
              </div>
              ${!match.is_seen ? '<div style="position: absolute; top: 12px; left: 12px; width: 10px; height: 10px; background: var(--accent-blue); border-radius: 50%;"></div>' : ''}
            </div>
            <div class="vehicle-card-body">
              <h3 class="vehicle-card-title">${match.year || ''} ${escapeHtml(match.make || '')} ${escapeHtml(match.model || '')}</h3>
              <p class="vehicle-card-subtitle">${match.trim ? escapeHtml(match.trim) : ''}</p>
              <div class="vehicle-card-meta">
                ${match.price ? `<span>💰 $${Number(match.price).toLocaleString()}</span>` : ''}
                ${match.mileage ? `<span>🛣️ ${Number(match.mileage).toLocaleString()} mi</span>` : ''}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                ${match.location ? `<span>📍 ${escapeHtml(match.location)}</span>` : ''}
                ${match.source ? `<span>🔗 ${escapeHtml(match.source)}</span>` : ''}
              </div>
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm ${match.is_seen ? 'btn-ghost' : 'btn-secondary'}" onclick="markMatchSeen('${match.id}', ${!match.is_seen})">
                  ${match.is_seen ? '👁️ Seen' : '👁️ Mark Seen'}
                </button>
                <button class="btn btn-sm ${match.is_saved ? 'btn-primary' : 'btn-secondary'}" onclick="saveMatch('${match.id}', ${!match.is_saved})">
                  ${match.is_saved ? '⭐ Saved' : '☆ Save'}
                </button>
                <button class="btn btn-sm btn-ghost" onclick="dismissMatch('${match.id}')" title="Dismiss">
                  ✕
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterAIMatches() {
      renderDreamCarMatches();
    }

    function viewSearchMatches(searchId) {
      loadDreamCarMatches(searchId);
    }

    function openAISearchModal(searchId = null) {
      editingSearchId = searchId;
      const modal = document.getElementById('ai-search-modal');
      const titleEl = document.getElementById('ai-search-modal-title');
      const form = document.getElementById('ai-search-form');
      
      form.reset();
      document.getElementById('ai-search-id').value = '';
      
      document.querySelectorAll('input[name="ai-body-style"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="ai-fuel-type"]').forEach(cb => cb.checked = false);
      document.getElementById('ai-search-notify-email').checked = true;
      document.getElementById('ai-search-active').checked = true;
      document.getElementById('ai-search-email-report-frequency').value = 'daily';
      
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
          document.getElementById('ai-search-max-mileage').value = search.max_mileage || '';
          document.getElementById('ai-search-makes').value = (search.preferred_makes || []).join(', ');
          document.getElementById('ai-search-models').value = (search.preferred_models || []).join(', ');
          document.getElementById('ai-search-trims').value = (search.preferred_trims || []).join(', ');
          document.getElementById('ai-search-zip').value = search.zip_code || '';
          document.getElementById('ai-search-radius').value = search.max_distance_miles || '';
          document.getElementById('ai-search-colors').value = (search.exterior_colors || []).join(', ');
          document.getElementById('ai-search-features').value = (search.must_have_features || []).join(', ');
          document.getElementById('ai-search-frequency').value = search.search_frequency || 'daily';
          document.getElementById('ai-search-email-report-frequency').value = search.email_report_frequency || 'daily';
          document.getElementById('ai-search-notify-email').checked = search.notify_email !== false;
          document.getElementById('ai-search-notify-sms').checked = search.notify_sms === true;
          document.getElementById('ai-search-active').checked = search.is_active !== false;
          
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
        
        const searchData = {
          user_id: session.user.id,
          search_name: document.getElementById('ai-search-name').value.trim(),
          min_year: parseInt(document.getElementById('ai-search-min-year').value) || null,
          max_year: parseInt(document.getElementById('ai-search-max-year').value) || null,
          min_price: parseFloat(document.getElementById('ai-search-min-price').value) || null,
          max_price: parseFloat(document.getElementById('ai-search-max-price').value) || null,
          max_mileage: parseInt(document.getElementById('ai-search-max-mileage').value) || null,
          preferred_makes: document.getElementById('ai-search-makes').value.split(',').map(s => s.trim()).filter(s => s),
          preferred_models: document.getElementById('ai-search-models').value.split(',').map(s => s.trim()).filter(s => s),
          preferred_trims: document.getElementById('ai-search-trims').value.split(',').map(s => s.trim()).filter(s => s),
          body_styles: bodyStyles,
          fuel_types: fuelTypes,
          zip_code: document.getElementById('ai-search-zip').value.trim() || null,
          max_distance_miles: parseInt(document.getElementById('ai-search-radius').value) || null,
          exterior_colors: document.getElementById('ai-search-colors').value.split(',').map(s => s.trim()).filter(s => s),
          must_have_features: document.getElementById('ai-search-features').value.split(',').map(s => s.trim()).filter(s => s),
          search_frequency: document.getElementById('ai-search-frequency').value,
          email_report_frequency: document.getElementById('ai-search-email-report-frequency').value,
          notify_email: document.getElementById('ai-search-notify-email').checked,
          notify_sms: document.getElementById('ai-search-notify-sms').checked,
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
              ${photo ? `<img src="${escapeHtml(photo)}" alt="Car photo" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentNode.innerHTML='<div style=\\'font-size: 60px;\\'>🚗</div>'">` : '<div style="font-size: 60px;">🚗</div>'}
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
              ${match.is_saved ? '<span style="color: var(--accent-gold);">⭐ Saved</span>' : ''}
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
                🔗 View Original Listing
              </a>
            ` : ''}
          </div>
        </div>
        ${match.match_reasons && match.match_reasons.length > 0 ? `
          <div style="margin-top: 20px; padding: 16px; background: var(--bg-input); border-radius: var(--radius-md);">
            <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--accent-gold);">Why this matches:</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${match.match_reasons.map(r => `<span style="padding: 4px 10px; background: var(--accent-gold-soft); color: var(--accent-gold); border-radius: 100px; font-size: 0.82rem;">✓ ${escapeHtml(r)}</span>`).join('')}
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
          year: parseInt(currentMatchDetail.year) || null,
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
            <div class="empty-state-icon">🚘</div>
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
              <div class="vehicle-emoji">🚘</div>
              ${p.is_favorite ? '<div style="position:absolute;top:12px;left:12px;font-size:24px;">❤️</div>' : ''}
              <div class="vehicle-card-badge" style="background:${statusColors[p.status] || statusColors.considering};color:${p.status === 'passed' ? 'var(--text-primary)' : '#fff'};">${statusLabels[p.status] || 'Considering'}</div>
            </div>
            <div class="vehicle-card-body">
              <div class="vehicle-card-title">${p.year || ''} ${p.make || ''} ${p.model || ''}</div>
              <div class="vehicle-card-subtitle">${p.trim || ''} ${p.body_style ? '• ' + p.body_style : ''}</div>
              <div class="vehicle-card-meta">
                ${p.mileage ? `<span>🛣️ ${Number(p.mileage).toLocaleString()} mi</span>` : ''}
                ${p.asking_price ? `<span>💰 $${Number(p.asking_price).toLocaleString()}</span>` : ''}
                ${p.carfax_accidents !== null ? `<span>⚠️ ${p.carfax_accidents} accidents</span>` : ''}
              </div>
              ${matchScore !== null ? `
                <div style="margin-top:12px;padding:8px 12px;background:${matchScore >= 80 ? 'var(--accent-green-soft)' : matchScore >= 50 ? 'var(--accent-orange-soft)' : 'rgba(239,95,95,0.15)'};border-radius:var(--radius-sm);display:inline-flex;align-items:center;gap:6px;">
                  <span style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}% Match</span>
                </div>
              ` : ''}
              ${p.personal_rating ? `
                <div style="margin-top:8px;color:var(--accent-gold);">
                  ${'⭐'.repeat(p.personal_rating)}${'☆'.repeat(5 - p.personal_rating)}
                </div>
              ` : ''}
              <div class="vehicle-card-actions" onclick="event.stopPropagation();">
                <button class="btn btn-sm btn-secondary" onclick="editProspect('${p.id}')">✏️ Edit</button>
                <button class="btn btn-sm btn-ghost" onclick="toggleFavorite('${p.id}')" title="${p.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">${p.is_favorite ? '❤️' : '🤍'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProspect('${p.id}')">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterProspects() {
      renderProspects();
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
        const r = parseInt(star.dataset.rating);
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
      btn.textContent = '⏳ Looking up...';

      try {
        const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
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
        btn.textContent = '🔍 Lookup';
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
          year: parseInt(document.getElementById('prospect-year').value) || null,
          make: document.getElementById('prospect-make').value.trim() || null,
          model: document.getElementById('prospect-model').value.trim() || null,
          trim: document.getElementById('prospect-trim').value.trim() || null,
          body_style: document.getElementById('prospect-body-style').value || null,
          engine: document.getElementById('prospect-engine').value.trim() || null,
          fuel_type: document.getElementById('prospect-fuel-type').value || null,
          mileage: parseInt(document.getElementById('prospect-mileage').value) || null,
          asking_price: parseFloat(document.getElementById('prospect-price').value) || null,
          exterior_color: document.getElementById('prospect-ext-color').value.trim() || null,
          interior_color: document.getElementById('prospect-int-color').value.trim() || null,
          seller_type: document.getElementById('prospect-seller-type').value || null,
          seller_name: document.getElementById('prospect-seller-name').value.trim() || null,
          seller_location: document.getElementById('prospect-location').value.trim() || null,
          listing_url: document.getElementById('prospect-listing-url').value.trim() || null,
          carfax_accidents: parseInt(document.getElementById('prospect-accidents').value) || 0,
          carfax_owners: parseInt(document.getElementById('prospect-owners').value) || null,
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
              <div style="font-size:2rem;margin-bottom:4px;">${prospect.carfax_service_records ? '✅' : '❌'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">Service Records</div>
            </div>
          </div>
          ${prospect.carfax_notes ? `<p style="margin-top:12px;font-size:0.9rem;color:var(--text-secondary);">${prospect.carfax_notes}</p>` : ''}
        </div>

        <div style="margin-top:24px;display:flex;gap:24px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Your Rating</h4>
            <div style="font-size:28px;color:var(--accent-gold);">
              ${prospect.personal_rating ? '⭐'.repeat(prospect.personal_rating) + '☆'.repeat(5 - prospect.personal_rating) : '☆☆☆☆☆'}
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
          <button class="btn btn-primary" onclick="editProspect('${prospect.id}');closeViewProspectModal();">✏️ Edit</button>
          <button class="btn btn-secondary" onclick="toggleFavorite('${prospect.id}');closeViewProspectModal();">${prospect.is_favorite ? '❤️ Unfavorite' : '🤍 Favorite'}</button>
          <button class="btn btn-danger" onclick="deleteProspect('${prospect.id}');closeViewProspectModal();">🗑️ Delete</button>
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
        { label: 'Service Records', key: 'carfax_service_records', format: v => v ? '✅ Yes' : '❌ No' },
        { label: 'Your Rating', key: 'personal_rating', format: v => v ? '⭐'.repeat(v) : 'N/A', best: 'high' },
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
          min_budget: parseFloat(document.getElementById('pref-min-budget').value) || null,
          max_budget: parseFloat(document.getElementById('pref-max-budget').value) || null,
          min_year: parseInt(document.getElementById('pref-min-year').value) || null,
          max_year: parseInt(document.getElementById('pref-max-year').value) || null,
          max_mileage: parseInt(document.getElementById('pref-max-mileage').value) || null,
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
        const response = await fetch('/api/shop/products');
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
        case 'apparel': return '👕';
        case 'accessories': return '🎒';
        case 'decals': return '🏷️';
        default: return '📦';
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
            <div style="font-size:40px;margin-bottom:12px;">🛒</div>
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
        
        const response = await fetch('/api/shop/checkout', {
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
          const stripeConfig = await fetch('/api/config/stripe');
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
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '📦'}
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
                  📍 Track Shipment
                </button>
              ` : ''}
            </div>
          </div>
        ` : '';
        
        return `
          <div class="order-card" id="order-${order.id}">
            <div class="order-card-header" onclick="toggleOrderDetails('${order.id}')">
              <div class="order-card-info">
                <div class="order-icon">📦</div>
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
              <span class="order-expand-icon">▼</span>
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
              statusIcon = '✅';
              break;
            case 'pending':
            default:
              statusClass = 'background:var(--accent-orange-soft);color:var(--accent-orange);';
              statusLabel = 'Pending';
              statusIcon = '⏳';
              break;
          }
          
          const creditAmount = referral.status === 'credited' ? `+$${(referral.credit_amount / 100).toFixed(0)}` : '-';
          
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:12px;border:1px solid var(--border-subtle);">
              <div style="display:flex;align-items:center;gap:16px;">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--accent-blue-soft);display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>
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
            <div class="empty-state-icon">⛽</div>
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
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;">${fuelTypeEmoji} ${parseFloat(log.gallons).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;">$${parseFloat(log.price_per_gallon).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;text-align:right;font-weight:600;color:var(--accent-gold);">$${parseFloat(log.total_cost).toFixed(2)}</td>
                    <td style="padding:14px 8px;font-size:0.9rem;color:var(--text-secondary);">${log.station_name || '-'}</td>
                    <td style="padding:14px 8px;text-align:center;">
                      <button class="btn btn-ghost btn-sm" onclick="editFuelLog('${log.id}')" title="Edit">✏️</button>
                      <button class="btn btn-ghost btn-sm" onclick="deleteFuelLog('${log.id}')" title="Delete" style="color:var(--accent-red);">🗑️</button>
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
        case 'regular': return '⛽';
        case 'mid-grade': return '⛽';
        case 'premium': return '🏎️';
        case 'diesel': return '🛢️';
        case 'electric': return '🔋';
        default: return '⛽';
      }
    }

    function renderFuelCharts() {
      renderMpgTrendChart();
      renderSpendingChart();
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

    function renderSpendingChart() {
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
            return new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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
        const gallons = parseFloat(gallonsInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
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
          odometer: parseInt(odometer),
          gallons: parseFloat(gallons),
          price_per_gallon: parseFloat(pricePerGallon),
          total_cost: totalCost ? parseFloat(totalCost) : null,
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
            <div class="empty-state-icon">📋</div>
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
              <span>🚗</span> ${vehicleName}
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
                📥 Download
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="deleteInsuranceDocument('${doc.id}')" style="color:var(--accent-red);" title="Delete">
              🗑️
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
      
      const dropzone = document.getElementById('insurance-file-dropzone');
      const preview = document.getElementById('insurance-file-preview');
      const fileName = document.getElementById('insurance-file-name');
      const fileSize = document.getElementById('insurance-file-size');
      
      if (dropzone) dropzone.style.display = 'none';
      if (preview) preview.style.display = 'flex';
      if (fileName) fileName.textContent = file.name;
      if (fileSize) fileSize.textContent = formatFileSize(file.size);
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function clearInsuranceFile() {
      selectedInsuranceFile = null;
      const fileInput = document.getElementById('insurance-file-input');
      const dropzone = document.getElementById('insurance-file-dropzone');
      const preview = document.getElementById('insurance-file-preview');
      
      if (fileInput) fileInput.value = '';
      if (dropzone) dropzone.style.display = 'block';
      if (preview) preview.style.display = 'none';
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
        
        if (selectedInsuranceFile) {
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

    // ========== END INSURANCE DOCUMENTS SECTION ==========
