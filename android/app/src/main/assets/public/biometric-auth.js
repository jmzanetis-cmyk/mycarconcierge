const BiometricAuth = (function() {
  const BIOMETRIC_ENABLED_KEY = 'mcc_biometric_enabled';
  const BIOMETRIC_USER_KEY = 'mcc_biometric_user_id';
  const SECURE_TOKEN_KEY = 'mcc_secure_token';
  const SECURE_REFRESH_TOKEN_KEY = 'mcc_secure_refresh_token';

  // Map numeric BiometryType enum from @aparajita/capacitor-biometric-auth to
  // the string keys used by getBiometryTypeName (plugin returns 0-5, not strings)
  function _normalizeBiometryType(type) {
    const map = { 0: 'none', 1: 'touchId', 2: 'faceId', 3: 'fingerprint', 4: 'face', 5: 'iris' };
    return (typeof type === 'number' ? map[type] : type) || 'unknown';
  }

  function isCapacitor() {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  }

  async function isAvailable() {
    if (!isCapacitor()) {
      return { available: false, biometryType: 'none', reason: 'web' };
    }

    try {
      if (Capacitor.Plugins && Capacitor.Plugins.BiometricAuthNative) {
        const result = await Capacitor.Plugins.BiometricAuthNative.checkBiometry();
        return {
          available: result.isAvailable,
          biometryType: _normalizeBiometryType(result.biometryType),
          reason: result.reason || null
        };
      }

      return { available: false, biometryType: 'none', reason: 'plugin_not_installed' };
    } catch (error) {
      console.warn('BiometricAuth: Error checking availability:', error);
      return { available: false, biometryType: 'none', reason: 'error' };
    }
  }

  async function authenticate(reason = 'Authenticate to continue') {
    if (!isCapacitor()) {
      return { success: false, error: 'Biometric auth not available on web' };
    }

    try {
      if (Capacitor.Plugins && Capacitor.Plugins.BiometricAuthNative) {
        await Capacitor.Plugins.BiometricAuthNative.authenticate({
          reason: reason,
          cancelTitle: 'Cancel',
          allowDeviceCredential: true,
          iosFallbackTitle: 'Use Passcode'
        });
        return { success: true };
      }

      return { success: false, error: 'Biometric plugin not available' };
    } catch (error) {
      console.warn('BiometricAuth: Authentication failed:', error);
      return { success: false, error: error.message || 'Authentication cancelled' };
    }
  }

  async function enrollBiometric(userId, accessToken, refreshToken) {
    try {
      localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
      localStorage.setItem(BIOMETRIC_USER_KEY, userId);

      if (isCapacitor() && accessToken) {
        await storeSecureToken(accessToken);
      }
      if (isCapacitor() && refreshToken) {
        await _storeSecureKey(SECURE_REFRESH_TOKEN_KEY, refreshToken);
      }

      return { success: true };
    } catch (error) {
      console.error('BiometricAuth: Error enrolling:', error);
      return { success: false, error: error.message };
    }
  }

  async function disableBiometric() {
    try {
      localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
      localStorage.removeItem(BIOMETRIC_USER_KEY);

      if (isCapacitor()) {
        await removeSecureToken();
        await _removeSecureKey(SECURE_REFRESH_TOKEN_KEY);
      }

      return { success: true };
    } catch (error) {
      console.error('BiometricAuth: Error disabling:', error);
      return { success: false, error: error.message };
    }
  }

  function isBiometricEnabled() {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
  }

  function getStoredUserId() {
    return localStorage.getItem(BIOMETRIC_USER_KEY);
  }

  // Private key-parameterized storage helpers — Keychain-backed on native via
  // SecureStoragePlugin, then Preferences, then localStorage as last resort.
  // On native, SecureStoragePlugin (iOS Keychain) is always tried first, so
  // tokens never end up in plain localStorage on a real device unless both
  // SecureStoragePlugin and Preferences are absent (which shouldn't happen).
  async function _storeSecureKey(key, token) {
    if (!isCapacitor()) return { success: false };
    try {
      if (Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        await Capacitor.Plugins.SecureStoragePlugin.set({ key, value: token });
        return { success: true };
      }
      if (Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        await Capacitor.Plugins.Preferences.set({ key, value: token });
        return { success: true };
      }
      localStorage.setItem(key, token);
      return { success: true };
    } catch (error) {
      console.warn('BiometricAuth: Error storing secure key:', error);
      localStorage.setItem(key, token);
      return { success: true };
    }
  }

  async function _getSecureKey(key) {
    if (!isCapacitor()) return { success: false, token: null };
    try {
      if (Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        const result = await Capacitor.Plugins.SecureStoragePlugin.get({ key });
        return { success: true, token: result.value };
      }
      if (Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        const result = await Capacitor.Plugins.Preferences.get({ key });
        return { success: true, token: result.value };
      }
      const token = localStorage.getItem(key);
      return { success: !!token, token };
    } catch (error) {
      console.warn('BiometricAuth: Error getting secure key:', error);
      const token = localStorage.getItem(key);
      return { success: !!token, token };
    }
  }

  async function _removeSecureKey(key) {
    try {
      if (isCapacitor() && Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        await Capacitor.Plugins.SecureStoragePlugin.remove({ key });
      } else if (isCapacitor() && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        await Capacitor.Plugins.Preferences.remove({ key });
      }
      localStorage.removeItem(key);
      return { success: true };
    } catch (error) {
      console.warn('BiometricAuth: Error removing secure key:', error);
      localStorage.removeItem(key);
      return { success: true };
    }
  }

  // Public wrappers for the access token (kept for any external callers)
  async function storeSecureToken(token) { return _storeSecureKey(SECURE_TOKEN_KEY, token); }
  async function getSecureToken() { return _getSecureKey(SECURE_TOKEN_KEY); }
  async function removeSecureToken() { return _removeSecureKey(SECURE_TOKEN_KEY); }

  function getBiometryTypeName(type) {
    const types = {
      'touchId': 'Touch ID',
      'faceId': 'Face ID',
      'fingerprint': 'Fingerprint',
      'face': 'Face Recognition',
      'iris': 'Iris',
      'none': 'Biometrics',
      'unknown': 'Biometrics'
    };
    return types[type] || 'Biometrics';
  }

  async function shouldPromptBiometric() {
    if (!isBiometricEnabled()) {
      return false;
    }

    const availability = await isAvailable();
    return availability.available;
  }

  async function performBiometricLogin(supabaseClient) {
    const authResult = await authenticate('Sign in to My Car Concierge');

    if (!authResult.success) {
      return { success: false, error: authResult.error };
    }

    try {
      // If a live session is already present (app was backgrounded, not cold-started)
      // return it immediately — no token restore needed.
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (session && !error) {
        return { success: true, user: session.user, session };
      }

      // Cold start: restore session using the stored access + refresh tokens.
      // Supabase will re-issue a fresh session using the refresh token, so login
      // stays valid indefinitely rather than expiring with the access token (~1hr).
      const accessResult = await _getSecureKey(SECURE_TOKEN_KEY);
      const refreshResult = await _getSecureKey(SECURE_REFRESH_TOKEN_KEY);

      if (accessResult.success && accessResult.token && refreshResult.success && refreshResult.token) {
        const { data, error: restoreError } = await supabaseClient.auth.setSession({
          access_token: accessResult.token,
          refresh_token: refreshResult.token
        });

        if (data.session && !restoreError) {
          return { success: true, user: data.session.user, session: data.session };
        }
      }

      await disableBiometric();
      return { success: false, error: 'Session expired. Please sign in with password.' };
    } catch (error) {
      console.error('BiometricAuth: Login error:', error);
      return { success: false, error: 'Authentication failed. Please try again.' };
    }
  }

  return {
    isCapacitor,
    isAvailable,
    authenticate,
    enrollBiometric,
    disableBiometric,
    isBiometricEnabled,
    getStoredUserId,
    storeSecureToken,
    getSecureToken,
    removeSecureToken,
    getBiometryTypeName,
    shouldPromptBiometric,
    performBiometricLogin
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BiometricAuth;
}
