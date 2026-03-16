// ========== MY CAR CONCIERGE - CAPACITOR PUSH NOTIFICATIONS ==========
// Native FCM push via @capacitor/push-notifications
// Active only inside Capacitor iOS / Android native app

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
    if (section && typeof window.showSection === 'function') {
      setTimeout(() => window.showSection(section), 300);
    }
  }

  function updateNativePushUI(enabled, permissionDenied) {
    const card = document.getElementById('native-push-card');
    if (!card) return;
    const enableSection = document.getElementById('native-push-enable-section');
    const enabledSection = document.getElementById('native-push-enabled-section');
    const deniedSection = document.getElementById('native-push-denied-section');
    const badge = document.getElementById('native-push-badge');
    const statusText = document.getElementById('native-push-status-text');

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

  window.initCapacitorPush = async function () {
    if (!isCapacitorNative()) return;

    const nativeCard = document.getElementById('native-push-card');
    const webPushCard = document.getElementById('web-push-card');
    if (nativeCard) nativeCard.style.display = 'block';
    if (webPushCard) webPushCard.style.display = 'none';

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

    updateNativePushUI(permissionStatus === 'granted', permissionStatus === 'denied');

    plugin.addListener('registration', async ({ value: token }) => {
      const platform = window.Capacitor?.getPlatform?.() || 'unknown';
      await registerDeviceToken(token, platform);
      updateNativePushUI(true, false);
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

    if (permissionStatus === 'granted') {
      try { await plugin.register(); } catch {}
    }
  };

  window.requestNativePushPermission = async function () {
    if (!isCapacitorNative()) return;
    const plugin = getPushPlugin();
    if (!plugin) return;

    const btn = document.getElementById('native-push-enable-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enabling…'; }

    try {
      let { receive: status } = await plugin.checkPermissions();
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        const result = await plugin.requestPermissions();
        status = result.receive;
      }
      if (status === 'granted') {
        await plugin.register();
      } else if (status === 'denied') {
        updateNativePushUI(false, true);
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> Enable Notifications'; }
      }
    } catch (err) {
      console.error('[CapacitorPush] Permission error:', err);
      if (typeof window.showToast === 'function') window.showToast('Could not enable notifications', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> Enable Notifications'; }
    }
  };

  window.disableNativePush = async function () {
    if (!isCapacitorNative()) return;
    const plugin = getPushPlugin();
    if (!plugin) return;

    try {
      await plugin.removeAllDeliveredNotifications();
      const stored = localStorage.getItem('mcc_fcm_token');
      if (stored) await unregisterDeviceToken(stored);
      updateNativePushUI(false, false);
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
          if (isCapacitorNative()) window.initCapacitorPush();
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
    const tryInit = async () => {
      if (window.supabaseClient) {
        try {
          const { data: { session } } = await window.supabaseClient.auth.getSession();
          if (session) await window.initCapacitorPush();
        } catch {}
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 1500));
    } else {
      setTimeout(tryInit, 1500);
    }
  }

})();
