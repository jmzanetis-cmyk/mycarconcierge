// ========== MY CAR CONCIERGE - CAPACITOR PUSH NOTIFICATIONS ==========
// Native FCM push via @capacitor/push-notifications
// Active only inside Capacitor iOS / Android native app
// Supports both member (members.html) and provider (providers.html) contexts

(function () {

  function isCapacitorNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function getPushPlugin() {
    return window.Capacitor?.Plugins?.PushNotifications || null;
  }

  async function getAuthToken() {
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function registerDeviceToken(token, platform) {
    const authToken = await getAuthToken();
    if (!authToken) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    try {
      await fetch(`${apiBase}/api/push/register-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ token, platform })
      });
      localStorage.setItem('mcc_fcm_token', token);
      console.log('[CapacitorPush] Device token registered');
    } catch (err) {
      console.error('[CapacitorPush] Token registration failed:', err.message);
    }
  }

  async function unregisterDeviceToken(token) {
    const authToken = await getAuthToken();
    if (!authToken) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    try {
      await fetch(`${apiBase}/api/push/unregister-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ token })
      });
      localStorage.removeItem('mcc_fcm_token');
    } catch (err) {
      console.error('[CapacitorPush] Token unregister failed:', err.message);
    }
  }

  function showInAppNotification(notification) {
    const title = notification.title || 'My Car Concierge';
    const body = notification.body || '';
    if (typeof window.showToast === 'function') {
      window.showToast(`${title}: ${body}`, 'info', 6000);
    } else {
      console.log(`[CapacitorPush] Foreground notification: ${title} — ${body}`);
    }
  }

  function handleNotificationDeepLink(data) {
    if (!data) return;
    const section = data.section || data.click_action;
    const entityId = data.entity_id;
    if (!section) return;

    const navigate = () => {
      if (typeof window.showSection === 'function') {
        window.showSection(section);
      }
      if (!entityId) return;
      const sec = section.toLowerCase();

      // Bid / quote detail
      if (sec === 'bids' || sec === 'quotes' || sec === 'bid-detail') {
        if (typeof window.openBidDetail === 'function') {
          window.openBidDetail(entityId);
        } else if (typeof window.showBid === 'function') {
          window.showBid(entityId);
        }
      }
      // Service request / job
      else if (sec === 'requests' || sec === 'jobs' || sec === 'job-detail') {
        if (typeof window.openRequest === 'function') {
          window.openRequest(entityId);
        } else if (typeof window.showJob === 'function') {
          window.showJob(entityId);
        }
      }
      // Service package
      else if (sec === 'packages' || sec === 'package-detail') {
        if (typeof window.openPackage === 'function') {
          window.openPackage(entityId);
        }
      }
      // Car club punch card
      else if (sec === 'carclub' || sec === 'loyalty' || sec === 'car-club') {
        if (typeof window.showCarClub === 'function') {
          window.showCarClub(entityId);
        }
      }
      // Payment / transaction
      else if (sec === 'payments' || sec === 'payment-detail') {
        if (typeof window.showPayment === 'function') {
          window.showPayment(entityId);
        }
      }
      // Vehicle
      else if (sec === 'vehicles' || sec === 'vehicle-detail') {
        if (typeof window.showVehicle === 'function') {
          window.showVehicle(entityId);
        }
      }
      // Appointment
      else if (sec === 'appointments' || sec === 'appointment-detail') {
        if (typeof window.showAppointment === 'function') {
          window.showAppointment(entityId);
        }
      }
    };

    setTimeout(navigate, 300);
  }

  // Returns element ID prefixes depending on context (member vs provider)
  function getUIIds(context) {
    if (context === 'provider') {
      return {
        card: 'provider-native-push-card',
        webCard: null,
        enableSection: 'provider-native-push-enable-section',
        enabledSection: 'provider-native-push-enabled-section',
        deniedSection: 'provider-native-push-denied-section',
        badge: 'provider-native-push-badge',
        statusText: 'provider-native-push-status-text',
        enableBtn: 'provider-native-push-enable-btn'
      };
    }
    return {
      card: 'native-push-card',
      webCard: 'web-push-card',
      enableSection: 'native-push-enable-section',
      enabledSection: 'native-push-enabled-section',
      deniedSection: 'native-push-denied-section',
      badge: 'native-push-badge',
      statusText: 'native-push-status-text',
      enableBtn: 'native-push-enable-btn'
    };
  }

  function updateNativePushUI(enabled, permissionDenied, context) {
    const ids = getUIIds(context);
    const card = document.getElementById(ids.card);
    if (!card) return;
    const enableSection = document.getElementById(ids.enableSection);
    const enabledSection = document.getElementById(ids.enabledSection);
    const deniedSection = document.getElementById(ids.deniedSection);
    const badge = document.getElementById(ids.badge);
    const statusText = document.getElementById(ids.statusText);

    if (enableSection) enableSection.style.display = 'none';
    if (enabledSection) enabledSection.style.display = 'none';
    if (deniedSection) deniedSection.style.display = 'none';

    if (permissionDenied) {
      if (deniedSection) deniedSection.style.display = 'block';
      if (badge) { badge.textContent = 'Denied'; badge.style.background = 'rgba(239,95,95,0.15)'; badge.style.color = 'var(--accent-red)'; }
      if (statusText) statusText.textContent = 'Notifications Blocked';
    } else if (enabled) {
      if (enabledSection) enabledSection.style.display = 'block';
      if (badge) { badge.textContent = 'On'; badge.style.background = 'rgba(74,200,140,0.15)'; badge.style.color = 'var(--accent-green)'; }
      if (statusText) statusText.textContent = 'Push Notifications Enabled';
    } else {
      if (enableSection) enableSection.style.display = 'block';
      if (badge) { badge.textContent = 'Off'; badge.style.background = 'rgba(239,95,95,0.15)'; badge.style.color = 'var(--accent-red)'; }
      if (statusText) statusText.textContent = 'Push Notifications Disabled';
    }
  }

  let _pushListenersAdded = false;

  window.initCapacitorPush = async function (context) {
    if (!isCapacitorNative()) return;

    const ids = getUIIds(context);
    const nativeCard = document.getElementById(ids.card);
    if (ids.webCard) {
      const webCard = document.getElementById(ids.webCard);
      if (webCard) webCard.style.display = 'none';
    }
    if (nativeCard) nativeCard.style.display = 'block';

    const plugin = getPushPlugin();
    if (!plugin) {
      console.warn('[CapacitorPush] PushNotifications plugin not available — run npx cap sync');
      return;
    }

    let permissionStatus = 'prompt';
    try {
      const { receive } = await plugin.checkPermissions();
      permissionStatus = receive;
    } catch {}

    updateNativePushUI(permissionStatus === 'granted', permissionStatus === 'denied', context);

    if (!_pushListenersAdded) {
      _pushListenersAdded = true;

      plugin.addListener('registration', async ({ value: token }) => {
        const platform = window.Capacitor?.getPlatform?.() || 'unknown';
        await registerDeviceToken(token, platform);
        const ctx = window._mccPushContext || context;
        updateNativePushUI(true, false, ctx);
        if (typeof window.showToast === 'function') window.showToast('Push notifications enabled!', 'success');
      });

      plugin.addListener('registrationError', (err) => {
        console.error('[CapacitorPush] Registration error:', err);
        if (typeof window.showToast === 'function') window.showToast('Failed to register for notifications', 'error');
      });

      plugin.addListener('pushNotificationReceived', (notification) => {
        showInAppNotification(notification);
      });

      plugin.addListener('pushNotificationActionPerformed', ({ notification }) => {
        handleNotificationDeepLink(notification?.data || {});
      });
    }

    window._mccPushContext = context;

    if (permissionStatus === 'granted') {
      try { await plugin.register(); } catch {}
    }
  };

  window.requestNativePushPermission = async function (context) {
    if (!isCapacitorNative()) return;
    const plugin = getPushPlugin();
    if (!plugin) return;

    const ctx = context || window._mccPushContext || 'member';
    const ids = getUIIds(ctx);
    const btn = document.getElementById(ids.enableBtn);
    if (btn) { btn.disabled = true; btn.textContent = 'Enabling…'; }

    const bellIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

    try {
      let { receive: status } = await plugin.checkPermissions();
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        const result = await plugin.requestPermissions();
        status = result.receive;
      }
      if (status === 'granted') {
        await plugin.register();
      } else if (status === 'denied') {
        updateNativePushUI(false, true, ctx);
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = `${bellIcon} Enable Notifications`; }
      }
    } catch (err) {
      console.error('[CapacitorPush] Permission error:', err);
      if (typeof window.showToast === 'function') window.showToast('Could not enable notifications', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `${bellIcon} Enable Notifications`; }
    }
  };

  window.disableNativePush = async function (context) {
    if (!isCapacitorNative()) return;
    const plugin = getPushPlugin();
    if (!plugin) return;

    const ctx = context || window._mccPushContext || 'member';

    try {
      await plugin.removeAllDeliveredNotifications();
      const stored = localStorage.getItem('mcc_fcm_token');
      if (stored) await unregisterDeviceToken(stored);
      updateNativePushUI(false, false, ctx);
      if (typeof window.showToast === 'function') window.showToast('Push notifications disabled', 'success');
    } catch (err) {
      console.error('[CapacitorPush] Disable error:', err);
    }
  };

  window._capacitorPushLoaded = true;

  (function () {
    const checkAndPatch = () => {
      if (typeof window.showSection !== 'function') return;
      const orig = window.showSection;
      window.showSection = function (sectionId) {
        const result = orig.apply(this, arguments);
        if (sectionId === 'settings' || sectionId === 'notifications') {
          if (isCapacitorNative()) window.initCapacitorPush(window._mccPushContext || 'member');
        }
        return result;
      };
    };
    if (typeof window.showSection === 'function') {
      checkAndPatch();
    } else {
      window.addEventListener('load', () => setTimeout(checkAndPatch, 500));
    }
  })();

  if (isCapacitorNative()) {
    const tryFirstLaunchPrompt = async () => {
      if (!window.supabaseClient) return;
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const plugin = getPushPlugin();
        if (!plugin) return;

        // Check current permission state
        const permStatus = await plugin.checkPermissions();
        const permState = permStatus?.receive || permStatus?.status;

        if (permState === 'prompt' || permState === 'prompt-with-rationale') {
          // First-launch: automatically request permission on native
          console.log('[CapacitorPush] First-launch: auto-requesting push permission');
          const requestResult = await plugin.requestPermissions();
          const granted = (requestResult?.receive || requestResult?.status) === 'granted';
          if (granted) {
            await window.initCapacitorPush(window._mccPushContext || 'member');
          } else {
            console.log('[CapacitorPush] Push permission denied by user on first-launch');
          }
        } else if (permState === 'granted') {
          // Already granted — register/refresh token
          await window.initCapacitorPush(window._mccPushContext || 'member');
        }
        // 'denied' — user previously denied, do not re-prompt
      } catch (err) {
        console.warn('[CapacitorPush] First-launch init error:', err.message || err);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(tryFirstLaunchPrompt, 2000));
    } else {
      setTimeout(tryFirstLaunchPrompt, 2000);
    }

    // Also re-check on auth state change (user logs in during session)
    if (window.supabaseClient && typeof window.supabaseClient.auth?.onAuthStateChange === 'function') {
      window.supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') {
          setTimeout(tryFirstLaunchPrompt, 1500);
        }
      });
    }
  }

})();
