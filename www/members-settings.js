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

    function toggleSmsOptions() {
      const enabled = document.getElementById('sms-enabled').checked;
      document.getElementById('sms-options').style.display = enabled ? 'block' : 'none';
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
        statusIcon.textContent = '🔔';
        statusText.textContent = 'Push Notifications Enabled';
        statusDesc.textContent = 'You\'ll receive instant alerts on this device.';
        statusBadge.textContent = 'On';
        statusBadge.style.background = 'rgba(74,200,140,0.15)';
        statusBadge.style.color = 'var(--accent-green)';
        enableSection.style.display = 'none';
        enabledSection.style.display = 'block';
      } else {
        statusIcon.textContent = '🔕';
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
          btn.textContent = '🔔 Enable Push Notifications';
          return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        
        const vapidKey = await getVapidKey();
        if (!vapidKey) {
          showToast('Push notifications not configured', 'error');
          btn.disabled = false;
          btn.textContent = '🔔 Enable Push Notifications';
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
        btn.textContent = '🔔 Enable Push Notifications';
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
    
    async function loadPushPreferences() {
      const bidAlerts = document.getElementById('push-bid-alerts');
      const vehicleStatus = document.getElementById('push-vehicle-status');
      const dreamCar = document.getElementById('push-dream-car');
      const maintenance = document.getElementById('push-maintenance');
      
      if (!bidAlerts) return;
      
      try {
        const response = await fetch(`/api/member/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        const prefs = data.preferences || {};
        
        bidAlerts.checked = prefs.push_bid_alerts !== false;
        vehicleStatus.checked = prefs.push_vehicle_status !== false;
        dreamCar.checked = prefs.push_dream_car_matches !== false;
        maintenance.checked = prefs.push_maintenance_reminders !== false;
        
        [bidAlerts, vehicleStatus, dreamCar, maintenance].forEach(el => {
          el.addEventListener('change', savePushPreferences);
        });
        
      } catch (error) {
        console.error('Failed to load push preferences:', error);
      }
    }
    
    async function savePushPreferences() {
      if (!currentUser) return;
      
      const preferences = {
        push_bid_alerts: document.getElementById('push-bid-alerts')?.checked ?? true,
        push_vehicle_status: document.getElementById('push-vehicle-status')?.checked ?? true,
        push_dream_car_matches: document.getElementById('push-dream-car')?.checked ?? true,
        push_maintenance_reminders: document.getElementById('push-maintenance')?.checked ?? true
      };
      
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


    // ========== 2FA FUNCTIONS ==========
    let pending2FAPhone = '';

    async function load2FAStatus() {
      if (!currentUser) return;
      
      const loadingEl = document.getElementById('2fa-loading');
      const contentEl = document.getElementById('2fa-content');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          update2FADisplay(false, null);
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        
        update2FADisplay(data.enabled, data.phone);
      } catch (error) {
        console.error('Error loading 2FA status:', error);
        update2FADisplay(false, null);
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
      }
    }

    function update2FADisplay(enabled, maskedPhone) {
      const statusIcon = document.getElementById('2fa-status-icon');
      const statusText = document.getElementById('2fa-status-text');
      const statusDesc = document.getElementById('2fa-status-desc');
      const statusBadge = document.getElementById('2fa-status-badge');
      const enableSection = document.getElementById('2fa-enable-section');
      const disableSection = document.getElementById('2fa-disable-section');
      const maskedPhoneEl = document.getElementById('2fa-masked-phone');
      
      if (enabled) {
        if (statusIcon) statusIcon.textContent = '🔒';
        if (statusText) statusText.textContent = '2FA is Enabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected with two-factor authentication.';
        if (statusBadge) {
          statusBadge.textContent = 'Enabled';
          statusBadge.style.background = 'var(--accent-green-soft)';
          statusBadge.style.color = 'var(--accent-green)';
        }
        if (enableSection) enableSection.style.display = 'none';
        if (disableSection) disableSection.style.display = 'block';
        if (maskedPhoneEl) maskedPhoneEl.textContent = maskedPhone || '***-***-****';
      } else {
        if (statusIcon) statusIcon.textContent = '🔓';
        if (statusText) statusText.textContent = '2FA is Disabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected by password only.';
        if (statusBadge) {
          statusBadge.textContent = 'Disabled';
          statusBadge.style.background = 'rgba(239,95,95,0.15)';
          statusBadge.style.color = 'var(--accent-red)';
        }
        if (enableSection) enableSection.style.display = 'block';
        if (disableSection) disableSection.style.display = 'none';
      }
    }

    function format2FAPhoneInput(input) {
      let value = input.value.replace(/\D/g, '');
      if (value.length > 10) value = value.slice(0, 10);
      
      if (value.length >= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length >= 3) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        input.value = `(${value}`;
      }
    }

    async function initiate2FAEnable() {
      const phoneInput = document.getElementById('2fa-phone-input');
      const phone = phoneInput.value.replace(/\D/g, '');
      
      if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
      }
      
      const btn = document.getElementById('2fa-enable-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Sending...';
      btn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/send-code`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          pending2FAPhone = phone;
          open2FAVerifyModal(phoneInput.value);
        } else {
          showToast(data.error || 'Failed to send verification code', 'error');
        }
      } catch (error) {
        console.error('Error sending 2FA code:', error);
        showToast('Failed to send verification code. Please try again.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    function open2FAVerifyModal(formattedPhone) {
      const phoneDisplay = document.getElementById('2fa-verify-phone-display');
      if (phoneDisplay) phoneDisplay.textContent = formattedPhone;
      
      // Clear all digit inputs
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        if (input) input.value = '';
      }
      
      document.getElementById('2fa-verify-error').style.display = 'none';
      document.getElementById('2fa-verify-btn').disabled = true;
      
      document.getElementById('2fa-verify-modal').classList.add('active');
      
      // Focus first input
      setTimeout(() => {
        const firstInput = document.getElementById('2fa-digit-1');
        if (firstInput) firstInput.focus();
      }, 100);
    }

    function close2FAVerifyModal() {
      document.getElementById('2fa-verify-modal').classList.remove('active');
    }

    function handle2FADigitInput(input, position) {
      const value = input.value.replace(/\D/g, '');
      input.value = value.slice(0, 1);
      
      if (value && position < 6) {
        const nextInput = document.getElementById(`2fa-digit-${position + 1}`);
        if (nextInput) nextInput.focus();
      }
      
      check2FACodeComplete();
    }

    function handle2FAKeydown(event, position) {
      if (event.key === 'Backspace' && !event.target.value && position > 1) {
        const prevInput = document.getElementById(`2fa-digit-${position - 1}`);
        if (prevInput) {
          prevInput.focus();
          prevInput.value = '';
        }
      }
    }

    function check2FACodeComplete() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      
      const verifyBtn = document.getElementById('2fa-verify-btn');
      if (verifyBtn) {
        verifyBtn.disabled = code.length !== 6;
      }
    }

    function get2FACode() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      return code;
    }

    async function verify2FACode() {
      const code = get2FACode();
      if (code.length !== 6) return;
      
      const btn = document.getElementById('2fa-verify-btn');
      const errorEl = document.getElementById('2fa-verify-error');
      
      btn.innerHTML = '⏳ Verifying...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          errorEl.textContent = 'Session expired. Please log in again.';
          errorEl.style.display = 'block';
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        // First verify the code
        const verifyResponse = await fetch(`${apiBase}/api/2fa/verify-code`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code: code })
        });
        
        const verifyData = await verifyResponse.json();
        
        if (!verifyData.success) {
          errorEl.textContent = verifyData.error || 'Invalid verification code';
          errorEl.style.display = 'block';
          btn.innerHTML = 'Verify & Enable 2FA';
          btn.disabled = false;
          return;
        }
        
        // Then enable 2FA
        const enableResponse = await fetch(`${apiBase}/api/2fa/enable`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const enableData = await enableResponse.json();
        
        if (enableData.success) {
          close2FAVerifyModal();
          showToast('✅ Two-factor authentication enabled successfully!', 'success');
          load2FAStatus();
          document.getElementById('2fa-phone-input').value = '';
        } else {
          errorEl.textContent = enableData.error || 'Failed to enable 2FA';
          errorEl.style.display = 'block';
        }
      } catch (error) {
        console.error('Error verifying 2FA code:', error);
        errorEl.textContent = 'An error occurred. Please try again.';
        errorEl.style.display = 'block';
      } finally {
        btn.innerHTML = 'Verify & Enable 2FA';
        btn.disabled = false;
      }
    }

    async function resend2FACode() {
      const resendBtn = document.getElementById('2fa-resend-btn');
      if (!pending2FAPhone || !resendBtn) return;
      
      resendBtn.textContent = 'Sending...';
      resendBtn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/send-code`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Verification code resent!', 'success');
        } else {
          showToast(data.error || 'Failed to resend code', 'error');
        }
      } catch (error) {
        console.error('Error resending 2FA code:', error);
        showToast('Failed to resend code. Please try again.', 'error');
      } finally {
        resendBtn.textContent = 'Resend Code';
        resendBtn.disabled = false;
      }
    }

    function open2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.add('active');
    }

    function close2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.remove('active');
    }

    async function confirm2FADisable() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/disable`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (data.success) {
          close2FADisableModal();
          showToast('Two-factor authentication has been disabled.', 'success');
          load2FAStatus();
        } else {
          showToast(data.error || 'Failed to disable 2FA', 'error');
        }
      } catch (error) {
        console.error('Error disabling 2FA:', error);
        showToast('Failed to disable 2FA. Please try again.', 'error');
      }
    }

    async function logout() {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    }

    // =============================================
    // MY NEXT CAR - Prospect Vehicle Functions
    // =============================================
    
    let prospectVehicles = [];
    let memberCarPreferences = null;
    let selectedProspectRating = 0;
    let editingProspectId = null;
    let selectedForComparison = new Set();

    function showProspectTab(tabName) {
      document.querySelectorAll('.prospect-tab-content').forEach(t => t.style.display = 'none');
      document.querySelectorAll('[data-prospect-tab]').forEach(t => t.classList.remove('active'));
      
      document.getElementById(tabName + '-tab').style.display = 'block';
      document.querySelector(`[data-prospect-tab="${tabName}"]`).classList.add('active');
      
      if (tabName === 'compare') {
        updateCompareSelection();
      } else if (tabName === 'preferences') {
        loadCarPreferences();
      } else if (tabName === 'ai-search') {
        loadDreamCarSearches();
      }
    }

    // =============================================
    // AI SEARCH - Dream Car Finder Functions
    // =============================================

    // ========== LOGIN ACTIVITY SECTION ==========
    
    let loginActivities = [];
    
    async function loadLoginActivity() {
      const loadingEl = document.getElementById('login-activity-loading');
      const contentEl = document.getElementById('login-activity-content');
      const emptyEl = document.getElementById('login-activity-empty');
      const alertEl = document.getElementById('login-activity-alert');
      const tableEl = document.getElementById('login-activity-table');
      const tbodyEl = document.getElementById('login-activity-tbody');
      
      if (!currentUser) return;
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      if (alertEl) alertEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
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
        
        const deviceIcon = activity.device_type === 'mobile' ? '📱' : 
                          activity.device_type === 'tablet' ? '📱' : '💻';
        const deviceLabel = activity.device_type ? (activity.device_type.charAt(0).toUpperCase() + activity.device_type.slice(1)) : 'Unknown';
        
        const statusBadge = activity.is_successful 
          ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--accent-green-soft);color:var(--accent-green);border-radius:100px;font-size:0.78rem;font-weight:500;">✓ Success</span>'
          : '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(239,95,95,0.15);color:var(--accent-red);border-radius:100px;font-size:0.78rem;font-weight:500;">✕ Failed</span>';
        
        const needsAction = !activity.is_successful && !activity.acknowledged_at;
        const isSuspicious = activity.reported_suspicious;
        
        let actionsHtml = '';
        if (isSuspicious) {
          actionsHtml = '<span style="font-size:0.8rem;color:var(--accent-red);">🚨 Reported</span>';
        } else if (needsAction) {
          actionsHtml = `
            <button class="btn btn-sm" style="padding:4px 10px;font-size:0.78rem;background:var(--accent-green-soft);color:var(--accent-green);border:1px solid rgba(74,200,140,0.3);" onclick="acknowledgeLoginActivity('${activity.id}')">
              ✓ This was me
            </button>
            <button class="btn btn-sm" style="padding:4px 10px;font-size:0.78rem;background:rgba(239,95,95,0.15);color:var(--accent-red);border:1px solid rgba(239,95,95,0.3);margin-left:4px;" onclick="reportSuspiciousLogin('${activity.id}')">
              🚨 Report
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
        const { data: { session } } = await supabase.auth.getSession();
        
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
        const { data: { session } } = await supabase.auth.getSession();
        
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
