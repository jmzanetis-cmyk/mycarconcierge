const BiometricAuth = (function() {
  const BIOMETRIC_ENABLED_KEY = 'mcc_biometric_enabled';
  const BIOMETRIC_USER_KEY = 'mcc_biometric_user_id';
  const SECURE_TOKEN_KEY = 'mcc_secure_token';

  function isCapacitor() {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  }

  async function isAvailable() {
    if (!isCapacitor()) {
      return { available: false, biometryType: 'none', reason: 'web' };
    }

    try {
      if (Capacitor.Plugins && Capacitor.Plugins.BiometricAuth) {
        const result = await Capacitor.Plugins.BiometricAuth.checkBiometry();
        return {
          available: result.isAvailable,
          biometryType: result.biometryType || 'unknown',
          reason: result.reason || null
        };
      }

      if (typeof NativeBiometric !== 'undefined') {
        const result = await NativeBiometric.isAvailable();
        return {
          available: result.isAvailable,
          biometryType: result.biometryType || 'unknown',
          reason: null
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
      if (Capacitor.Plugins && Capacitor.Plugins.BiometricAuth) {
        await Capacitor.Plugins.BiometricAuth.authenticate({
          reason: reason,
          title: 'My Car Concierge',
          subtitle: reason,
          cancelTitle: 'Cancel',
          allowDeviceCredential: true,
          iosFallbackTitle: 'Use Passcode'
        });
        return { success: true };
      }

      if (typeof NativeBiometric !== 'undefined') {
        await NativeBiometric.verifyIdentity({
          reason: reason,
          title: 'My Car Concierge',
          subtitle: reason,
          description: 'Sign in with biometrics',
          useFallback: true,
          fallbackTitle: 'Use Passcode'
        });
        return { success: true };
      }

      return { success: false, error: 'Biometric plugin not available' };
    } catch (error) {
      console.warn('BiometricAuth: Authentication failed:', error);
      return { success: false, error: error.message || 'Authentication cancelled' };
    }
  }

  async function enrollBiometric(userId, accessToken) {
    try {
      localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
      localStorage.setItem(BIOMETRIC_USER_KEY, userId);

      if (isCapacitor() && accessToken) {
        await storeSecureToken(accessToken);
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

  async function storeSecureToken(token) {
    if (!isCapacitor()) {
      return { success: false };
    }

    try {
      if (Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        await Capacitor.Plugins.SecureStoragePlugin.set({
          key: SECURE_TOKEN_KEY,
          value: token
        });
        return { success: true };
      }

      if (Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        await Capacitor.Plugins.Preferences.set({
          key: SECURE_TOKEN_KEY,
          value: token
        });
        return { success: true };
      }

      localStorage.setItem(SECURE_TOKEN_KEY, token);
      return { success: true };
    } catch (error) {
      console.warn('BiometricAuth: Error storing token securely:', error);
      localStorage.setItem(SECURE_TOKEN_KEY, token);
      return { success: true };
    }
  }

  async function getSecureToken() {
    if (!isCapacitor()) {
      return { success: false, token: null };
    }

    try {
      if (Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        const result = await Capacitor.Plugins.SecureStoragePlugin.get({ key: SECURE_TOKEN_KEY });
        return { success: true, token: result.value };
      }

      if (Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        const result = await Capacitor.Plugins.Preferences.get({ key: SECURE_TOKEN_KEY });
        return { success: true, token: result.value };
      }

      const token = localStorage.getItem(SECURE_TOKEN_KEY);
      return { success: !!token, token };
    } catch (error) {
      console.warn('BiometricAuth: Error getting secure token:', error);
      const token = localStorage.getItem(SECURE_TOKEN_KEY);
      return { success: !!token, token };
    }
  }

  async function removeSecureToken() {
    try {
      if (isCapacitor() && Capacitor.Plugins && Capacitor.Plugins.SecureStoragePlugin) {
        await Capacitor.Plugins.SecureStoragePlugin.remove({ key: SECURE_TOKEN_KEY });
      } else if (isCapacitor() && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
        await Capacitor.Plugins.Preferences.remove({ key: SECURE_TOKEN_KEY });
      }
      localStorage.removeItem(SECURE_TOKEN_KEY);
      return { success: true };
    } catch (error) {
      console.warn('BiometricAuth: Error removing token:', error);
      localStorage.removeItem(SECURE_TOKEN_KEY);
      return { success: true };
    }
  }

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
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      
      if (session && !error) {
        return { success: true, user: session.user, session };
      }

      const tokenResult = await getSecureToken();
      if (tokenResult.success && tokenResult.token) {
        const { data, error: refreshError } = await supabaseClient.auth.setSession({
          access_token: tokenResult.token,
          refresh_token: tokenResult.token
        });
        
        if (data.session && !refreshError) {
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
