// ========== MY CAR CONCIERGE - SETTINGS MODULE ==========
// Settings, notifications, preferences, 2FA, login activity

    // ========== SETTINGS ==========
    async function saveSettings() {
      const fullName = document.getElementById('settings-name').value.trim();
      const phone = document.getElementById('settings-phone').value.trim();
      const zipCode = document.getElementById('settings-zip').value.trim();
      const city = document.getElementById('settings-city').value.trim();
      const state = document.getElementById('settings-state').value;

      // SMS preferences
      const smsEnabled = document.getElementById('sms-enabled').checked;
      const smsBidReceived = document.getElementById('sms-bid-received').checked;
      const smsWorkCompleted = document.getElementById('sms-work-completed').checked;
      const smsNewMessage = document.getElementById('sms-new-message').checked;
      const smsBiddingEnding = document.getElementById('sms-bidding-ending')?.checked || false;

      if (!zipCode) {
        showToast('Please enter your ZIP code', 'error');
        return;
      }

      // Validate phone if SMS enabled
      if (smsEnabled && !phone) {
        showToast('Please enter your phone number to enable SMS notifications', 'error');
        return;
      }

      try {
        const bookingGuidance = localStorage.getItem('mcc_booking_guidance') || 'full';

        const { error } = await supabaseClient.from('profiles').update({
          full_name: fullName || null,
          phone: phone || null,
          zip_code: zipCode,
          city: city || null,
          state: state || null,
          sms_notifications: smsEnabled,
          sms_bid_received: smsBidReceived,
          sms_work_completed: smsWorkCompleted,
          sms_new_message: smsNewMessage,
          sms_bidding_ending: smsBiddingEnding
        }).eq('id', currentUser.id);

        if (error) throw error;

        try {
          await supabaseClient.from('profiles').update({ booking_guidance: bookingGuidance }).eq('id', currentUser.id);
        } catch (e) {}

        // Update local profile
        userProfile.full_name = fullName;
        userProfile.phone = phone;
        userProfile.zip_code = zipCode;
        userProfile.city = city;
        userProfile.state = state;
        userProfile.sms_notifications = smsEnabled;

        // Update display name
        const name = fullName || 'Member';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        document.getElementById('user-name').textContent = name;
        document.getElementById('user-avatar').textContent = initials;

        // Hide location warning
        document.getElementById('location-status').style.display = 'none';

        showToast('Settings saved!', 'success');
      } catch (err) {
        console.error('Save settings error:', err);
        showToast('Failed to save settings', 'error');
      }
    }

    // ==================== NOTIFICATION PREFERENCES FUNCTIONS ====================

    async function loadNotificationPreferences() {
      if (!currentUser) return;
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        
        if (data.warning) {
          console.log('Notification preferences:', data.warning);
        }
        
        const prefs = data.preferences || {};
        
        document.getElementById('pref-followup-email').checked = prefs.follow_up_emails !== false;
        document.getElementById('pref-followup-sms').checked = prefs.follow_up_sms !== false;
        document.getElementById('pref-maintenance-email').checked = prefs.maintenance_reminder_emails !== false;
        document.getElementById('pref-maintenance-sms').checked = prefs.maintenance_reminder_sms !== false;
        document.getElementById('pref-urgent-email').checked = prefs.urgent_update_emails !== false;
        document.getElementById('pref-urgent-sms').checked = prefs.urgent_update_sms !== false;
        document.getElementById('pref-marketing-email').checked = prefs.marketing_emails === true;
        document.getElementById('pref-marketing-sms').checked = prefs.marketing_sms === true;
        
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }

    async function saveNotificationPreferences() {
      if (!currentUser) {
        showToast('Please log in to save preferences', 'error');
        return;
      }
      
      const statusEl = document.getElementById('notif-save-status');
      statusEl.style.display = 'inline';
      statusEl.textContent = 'Saving...';
      statusEl.style.color = 'var(--text-muted)';
      
      const preferences = {
        follow_up_emails: document.getElementById('pref-followup-email').checked,
        follow_up_sms: document.getElementById('pref-followup-sms').checked,
        maintenance_reminder_emails: document.getElementById('pref-maintenance-email').checked,
        maintenance_reminder_sms: document.getElementById('pref-maintenance-sms').checked,
        urgent_update_emails: document.getElementById('pref-urgent-email').checked,
        urgent_update_sms: document.getElementById('pref-urgent-sms').checked,
        marketing_emails: document.getElementById('pref-marketing-email').checked,
        marketing_sms: document.getElementById('pref-marketing-sms').checked
      };
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
        
        const data = await response.json();
        
        if (data.success) {
          statusEl.textContent = '✓ Saved';
          statusEl.style.color = 'var(--accent-green)';
          showToast('Notification preferences saved!', 'success');
          
          setTimeout(() => {
            statusEl.style.display = 'none';
          }, 3000);
        } else if (data.warning) {
          statusEl.textContent = '⚠ Migration needed';
          statusEl.style.color = 'var(--accent-orange)';
          showToast('Preferences saved locally. Database migration pending.', 'warning');
        } else {
          throw new Error(data.error || 'Failed to save');
        }
        
      } catch (error) {
        console.error('Failed to save notification preferences:', error);
        statusEl.textContent = '✗ Failed';
        statusEl.style.color = 'var(--accent-red)';
        showToast('Failed to save notification preferences', 'error');
      }
    }

    // ==================== PUSH NOTIFICATIONS ====================
    
    let pushSubscription = null;
    
    async function initPushNotifications() {
      const notSupportedEl = document.getElementById('push-not-supported');
      const contentEl = document.getElementById('push-content');
      
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (notSupportedEl) notSupportedEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
      }
      
      try {
        const registration = await navigator.serviceWorker.ready;
        pushSubscription = await registration.pushManager.getSubscription();
        
        updatePushUI(!!pushSubscription);
        
        if (pushSubscription) {
          await loadPushPreferences();
        }
      } catch (error) {
        console.error('Push init error:', error);
      }
    }
    
    function updatePushUI(enabled) {
      const statusIcon = document.getElementById('push-status-icon');
      const statusText = document.getElementById('push-status-text');
      const statusDesc = document.getElementById('push-status-desc');
      const statusBadge = document.getElementById('push-status-badge');
      const enableSection = document.getElementById('push-enable-section');
      const enabledSection = document.getElementById('push-enabled-section');
      
      if (!statusIcon) return;
      
      if (enabled) {
        statusIcon.innerHTML = mccIcon('bell', 20);
        statusText.textContent = 'Push Notifications Enabled';
        statusDesc.textContent = 'You\'ll receive instant alerts on this device.';
        statusBadge.textContent = 'On';
        statusBadge.style.background = 'rgba(74,200,140,0.15)';
        statusBadge.style.color = 'var(--accent-green)';
        enableSection.style.display = 'none';
        enabledSection.style.display = 'block';
      } else {
        statusIcon.innerHTML = '<span style="opacity:0.5">' + mccIcon('bell', 20) + '</span>';
        statusText.textContent = 'Push Notifications Disabled';
        statusDesc.textContent = 'Enable to receive instant alerts for bids, vehicle updates, and more.';
        statusBadge.textContent = 'Off';
        statusBadge.style.background = 'rgba(239,95,95,0.15)';
        statusBadge.style.color = 'var(--accent-red)';
        enableSection.style.display = 'block';
        enabledSection.style.display = 'none';
      }
    }
    
    async function enablePushNotifications() {
      try {
        const btn = document.getElementById('push-enable-btn');
        btn.disabled = true;
        btn.textContent = 'Enabling...';
        
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
          showToast('Please allow notifications in your browser settings', 'error');
          btn.disabled = false;
          btn.innerHTML = mccIcon('bell', 16) + ' Enable Push Notifications';
          return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        
        const vapidKey = await getVapidKey();
        if (!vapidKey) {
          showToast('Push notifications not configured', 'error');
          btn.disabled = false;
          btn.innerHTML = mccIcon('bell', 16) + ' Enable Push Notifications';
          return;
        }
        
        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
        
        await savePushSubscription(pushSubscription);
        
        updatePushUI(true);
        showToast('Push notifications enabled!', 'success');
        
      } catch (error) {
        console.error('Enable push error:', error);
        showToast('Failed to enable push notifications', 'error');
        const btn = document.getElementById('push-enable-btn');
        btn.disabled = false;
        btn.innerHTML = mccIcon('bell', 16) + ' Enable Push Notifications';
      }
    }
    
    async function disablePushNotifications() {
      try {
        if (pushSubscription) {
          await pushSubscription.unsubscribe();
          await removePushSubscription();
          pushSubscription = null;
        }
        
        updatePushUI(false);
        showToast('Push notifications disabled', 'success');
        
      } catch (error) {
        console.error('Disable push error:', error);
        showToast('Failed to disable push notifications', 'error');
      }
    }
    
    async function getVapidKey() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/push/vapid-key`);
        const data = await response.json();
        return data.publicKey;
      } catch (error) {
        console.error('Failed to get VAPID key:', error);
        return null;
      }
    }
    
    async function savePushSubscription(subscription) {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        await fetch(`${apiBase}/api/push/subscribe`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            subscription: subscription.toJSON()
          })
        });
      } catch (error) {
        console.error('Failed to save push subscription:', error);
      }
    }
    
    async function removePushSubscription() {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        await fetch(`${apiBase}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error('Failed to remove push subscription:', error);
      }
    }
    
    const MEMBER_PUSH_PREF_FIELDS = [
      { id: 'push-bid-alerts',         key: 'push_bid_alerts' },
      { id: 'push-vehicle-status',     key: 'push_vehicle_status' },
      { id: 'push-dream-car',          key: 'push_dream_car_matches' },
      { id: 'push-maintenance',        key: 'push_maintenance_reminders' },
      { id: 'push-bid-accepted',       key: 'push_bid_accepted' },
      { id: 'push-payment-released',   key: 'push_payment_released' },
      { id: 'push-appointment-reminder', key: 'push_appointment_reminder' },
      { id: 'push-ai-match',           key: 'push_ai_match' },
      { id: 'push-car-club',           key: 'push_car_club' }
    ];

    async function loadPushPreferences() {
      const firstEl = document.getElementById(MEMBER_PUSH_PREF_FIELDS[0].id);
      if (!firstEl) return;
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        const prefs = data.preferences || {};
        
        MEMBER_PUSH_PREF_FIELDS.forEach(({ id, key }) => {
          const el = document.getElementById(id);
          if (el) {
            el.checked = prefs[key] !== false;
            el.addEventListener('change', savePushPreferences);
          }
        });
        
      } catch (error) {
        console.error('Failed to load push preferences:', error);
      }
    }
    
    async function savePushPreferences() {
      if (!currentUser) return;
      
      const preferences = {};
      MEMBER_PUSH_PREF_FIELDS.forEach(({ id, key }) => {
        preferences[key] = document.getElementById(id)?.checked ?? true;
      });
      
      try {
        await fetch(`/api/member/${currentUser.id}/notification-preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
      } catch (error) {
        console.error('Failed to save push preferences:', error);
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

    // ========== LOGIN ACTIVITY SECTION ==========
    
    let loginActivities = [];
    
    async function loadLoginActivity() {
      const loadingEl = document.getElementById('login-activity-loading');
      const contentEl = document.getElementById('login-activity-content');
      const emptyEl = document.getElementById('login-activity-empty');
      const alertEl = document.getElementById('login-activity-alert');
      const tableEl = document.getElementById('login-activity-table');
      const tbodyEl = document.getElementById('login-activity-tbody');
      
      if (!currentUser) {
        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }

      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      if (alertEl) alertEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/member/${currentUser.id}/login-activity`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        
        const data = await response.json();
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        
        if (!data.success) {
          console.error('Failed to load login activity:', data.error);
          if (tbodyEl) tbodyEl.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Failed to load login activity</td></tr>';
          return;
        }
        
        loginActivities = data.activities || [];
        
        if (loginActivities.length === 0) {
          if (emptyEl) emptyEl.style.display = 'block';
          if (tableEl) tableEl.style.display = 'none';
          return;
        }
        
        if (emptyEl) emptyEl.style.display = 'none';
        if (tableEl) tableEl.style.display = 'table';
        
        if (data.failed_unacknowledged_count > 0) {
          if (alertEl) {
            alertEl.style.display = 'block';
            const alertText = document.getElementById('login-activity-alert-text');
            if (alertText) {
              alertText.textContent = `There ${data.failed_unacknowledged_count === 1 ? 'was' : 'were'} ${data.failed_unacknowledged_count} recent failed login attempt${data.failed_unacknowledged_count === 1 ? '' : 's'} on your account. Review them below and consider changing your password if you don't recognize them.`;
            }
          }
        }
        
        renderLoginActivityTable();
      } catch (error) {
        console.error('Error loading login activity:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        if (tbodyEl) tbodyEl.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Error loading login activity</td></tr>';
      }
    }
    
    function renderLoginActivityTable() {
      const tbodyEl = document.getElementById('login-activity-tbody');
      if (!tbodyEl) return;
      
      tbodyEl.innerHTML = loginActivities.map(activity => {
        const loginDate = new Date(activity.login_at);
        const dateStr = loginDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = loginDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        const deviceIcon = activity.device_type === 'mobile' ? mccIcon('smartphone', 16) : 
                          activity.device_type === 'tablet' ? mccIcon('smartphone', 16) : mccIcon('settings', 16);
        const deviceLabel = activity.device_type ? (activity.device_type.charAt(0).toUpperCase() + activity.device_type.slice(1)) : 'Unknown';
        
        const statusBadge = activity.is_successful 
          ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--accent-green-soft);color:var(--accent-green);border-radius:100px;font-size:0.78rem;font-weight:500;">✓ Success</span>'
          : '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(239,95,95,0.15);color:var(--accent-red);border-radius:100px;font-size:0.78rem;font-weight:500;">✕ Failed</span>';
        
        const needsAction = !activity.is_successful && !activity.acknowledged_at;
        const isSuspicious = activity.reported_suspicious;
        
        let actionsHtml = '';
        if (isSuspicious) {
          actionsHtml = '<span style="font-size:0.8rem;color:var(--accent-red);display:inline-flex;align-items:center;gap:4px;">' + mccIcon('alert-triangle', 14) + ' Reported</span>';
        } else if (needsAction) {
          actionsHtml = `
            <button class="btn btn-sm" style="padding:4px 10px;font-size:0.78rem;background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(74,200,140,0.3);" onclick="acknowledgeLoginActivity('${activity.id}')">
              ✓ This was me
            </button>
            <button class="btn btn-sm" style="padding:4px 10px;font-size:0.78rem;background:rgba(239,95,95,0.15);color:var(--accent-red);border:1px solid rgba(239,95,95,0.3);margin-left:4px;display:inline-flex;align-items:center;gap:4px;" onclick="reportSuspiciousLogin('${activity.id}')">
              ${mccIcon('alert-triangle', 14)} Report
            </button>
          `;
        } else if (activity.acknowledged_at) {
          actionsHtml = '<span style="font-size:0.8rem;color:var(--text-muted);">✓ Acknowledged</span>';
        } else {
          actionsHtml = '<span style="font-size:0.8rem;color:var(--text-muted);">—</span>';
        }
        
        const rowStyle = needsAction ? 'background:rgba(239,95,95,0.05);' : '';
        
        return `
          <tr style="border-bottom:1px solid var(--border-subtle);${rowStyle}">
            <td style="padding:12px 8px;">
              <div style="font-weight:500;">${dateStr}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">${timeStr}</div>
            </td>
            <td style="padding:12px 8px;">
              <span style="display:flex;align-items:center;gap:6px;">
                ${deviceIcon} ${deviceLabel}
                <span style="font-size:0.82rem;color:var(--text-muted);">(${activity.os || 'Unknown'})</span>
              </span>
            </td>
            <td style="padding:12px 8px;">${activity.browser || 'Unknown'}</td>
            <td style="padding:12px 8px;font-family:monospace;font-size:0.82rem;">${maskIpAddress(activity.ip_address)}</td>
            <td style="padding:12px 8px;">${statusBadge}</td>
            <td style="padding:12px 8px;text-align:right;">${actionsHtml}</td>
          </tr>
        `;
      }).join('');
    }
    
    function maskIpAddress(ip) {
      if (!ip) return 'Unknown';
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
      }
      if (ip.includes(':')) {
        const colonParts = ip.split(':');
        if (colonParts.length > 2) {
          return `${colonParts[0]}:${colonParts[1]}:***`;
        }
      }
      return ip;
    }
    
    async function acknowledgeLoginActivity(activityId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/login-activity/${activityId}/acknowledge`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Login activity acknowledged', 'success');
          loadLoginActivity();
        } else {
          showToast(data.error || 'Failed to acknowledge', 'error');
        }
      } catch (error) {
        console.error('Error acknowledging login activity:', error);
        showToast('Failed to acknowledge login activity', 'error');
      }
    }
    
    async function reportSuspiciousLogin(activityId) {
      if (!confirm('Are you sure you want to report this login as suspicious? This will flag the activity for security review. We recommend changing your password after reporting.')) {
        return;
      }
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        const response = await fetch(`/api/login-activity/${activityId}/report-suspicious`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast(data.message || 'Suspicious activity reported', 'warning');
          loadLoginActivity();
        } else {
          showToast(data.error || 'Failed to report', 'error');
        }
      } catch (error) {
        console.error('Error reporting suspicious login:', error);
        showToast('Failed to report suspicious activity', 'error');
      }
    }
    
    // ========== END LOGIN ACTIVITY SECTION ==========
