    const form = document.getElementById('login-form');
    const messageEl = document.getElementById('message');
    const loginBtn = document.getElementById('login-btn');
    
    // Biometric state
    let pendingBiometricUser = null;
    let pendingBiometricSession = null;
    let currentBiometryType = 'unknown';
    
    // Check URL parameters for 2FA required redirect
    function getUrlParams() {
      const params = new URLSearchParams(window.location.search);
      return {
        twoFaRequired: params.get('2fa') === 'required',
        returnTo: params.get('returnTo') || null,
        oauth: params.get('oauth') || null
      };
    }

    let magicLinkRedirecting = false;

    window.addEventListener('load', async () => {
      await initBiometricUI();
      
      const user = await getCurrentUser();
      const urlParams = getUrlParams();
      
      if (user) {
        if (urlParams.twoFaRequired) {
          await handle2faRequiredRedirect(user);
        } else {
          await handleUserRedirect(user);
        }
      } else {
        await checkBiometricAutoPrompt();
      }
    });
    
    async function initBiometricUI() {
      if (typeof BiometricAuth === 'undefined') {
        return;
      }
      
      const availability = await BiometricAuth.isAvailable();
      const biometricSection = document.getElementById('biometric-login-section');
      
      if (availability.available && BiometricAuth.isBiometricEnabled()) {
        currentBiometryType = availability.biometryType;
        const typeName = BiometricAuth.getBiometryTypeName(availability.biometryType);
        
        const iconEl = document.getElementById('biometric-btn-icon');
        const textEl = document.getElementById('biometric-btn-text');
        
        if (availability.biometryType === 'faceId' || availability.biometryType === 'face') {
          iconEl.innerHTML = mccIcon('user', 24);
        } else if (availability.biometryType === 'touchId' || availability.biometryType === 'fingerprint') {
          iconEl.innerHTML = mccIcon('user', 24);
        }
        
        textEl.textContent = `Sign in with ${typeName}`;
        biometricSection.classList.add('show');
      } else {
        biometricSection.classList.remove('show');
      }
    }
    
    async function checkBiometricAutoPrompt() {
      if (typeof BiometricAuth === 'undefined') {
        return;
      }
      
      const shouldPrompt = await BiometricAuth.shouldPromptBiometric();
      
      if (shouldPrompt) {
        await triggerBiometricLogin();
      }
    }
    
    async function triggerBiometricLogin() {
      if (typeof BiometricAuth === 'undefined') {
        showMessage('Biometric authentication not available', 'error');
        return;
      }
      
      const biometricBtn = document.getElementById('biometric-login-btn');
      biometricBtn.disabled = true;
      biometricBtn.innerHTML = '<span class="spinner"></span>Authenticating...';
      
      try {
        const result = await BiometricAuth.performBiometricLogin(supabaseClient);
        
        if (result.success && result.user) {
          showMessage('Signed in successfully!', 'success');
          await new Promise(resolve => setTimeout(resolve, 300));
          await handleUserRedirect(result.user);
        } else {
          showMessage(result.error || 'Biometric authentication failed', 'error');
          await initBiometricUI();
        }
      } catch (error) {
        console.error('Biometric login error:', error);
        showMessage('Biometric authentication failed. Please try password login.', 'error');
        await initBiometricUI();
      }
      
      biometricBtn.disabled = false;
      const availability = await BiometricAuth.isAvailable();
      const typeName = BiometricAuth.getBiometryTypeName(availability.biometryType);
      biometricBtn.innerHTML = `<span class="biometric-btn-icon" id="biometric-btn-icon">${mccIcon('lock', 20)}</span><span>Sign in with ${typeName}</span>`;
    }
    
    async function checkBiometricEnrollmentOffer(user, session) {
      if (typeof BiometricAuth === 'undefined') {
        return false;
      }
      
      if (BiometricAuth.isBiometricEnabled()) {
        return false;
      }
      
      const availability = await BiometricAuth.isAvailable();
      
      if (!availability.available) {
        return false;
      }
      
      const enrolledBefore = localStorage.getItem('mcc_biometric_declined');
      if (enrolledBefore === 'true') {
        return false;
      }
      
      pendingBiometricUser = user;
      pendingBiometricSession = session;
      currentBiometryType = availability.biometryType;
      
      const typeName = BiometricAuth.getBiometryTypeName(availability.biometryType);
      const iconEl = document.getElementById('biometric-enroll-icon');
      const titleEl = document.getElementById('biometric-enroll-title');
      const textEl = document.getElementById('biometric-enroll-text');
      
      if (availability.biometryType === 'faceId' || availability.biometryType === 'face') {
        iconEl.innerHTML = mccIcon('user', 24);
        titleEl.textContent = `Enable ${typeName}`;
        textEl.textContent = `Would you like to use ${typeName} for faster, secure sign-in next time?`;
      } else if (availability.biometryType === 'touchId' || availability.biometryType === 'fingerprint') {
        iconEl.innerHTML = mccIcon('user', 24);
        titleEl.textContent = `Enable ${typeName}`;
        textEl.textContent = `Would you like to use ${typeName} for faster, secure sign-in next time?`;
      }
      
      showScreen('biometric-enroll-screen');
      return true;
    }
    
    async function enableBiometric() {
      if (!pendingBiometricUser || !pendingBiometricSession) {
        showMessage('Session expired. Please sign in again.', 'error');
        showScreen('login-form-container');
        return;
      }
      
      const enableBtn = document.getElementById('enable-biometric-btn');
      enableBtn.disabled = true;
      enableBtn.innerHTML = '<span class="spinner"></span>Setting up...';
      
      try {
        const authResult = await BiometricAuth.authenticate('Verify your identity to enable biometric sign-in');
        
        if (authResult.success) {
          await BiometricAuth.enrollBiometric(pendingBiometricUser.id, pendingBiometricSession.access_token);
          showMessage('Biometric sign-in enabled!', 'success');
          await new Promise(resolve => setTimeout(resolve, 500));
          await handleUserRedirect(pendingBiometricUser);
        } else {
          showMessage(authResult.error || 'Could not verify biometric. Proceeding with regular login.', 'warning');
          await new Promise(resolve => setTimeout(resolve, 1000));
          await handleUserRedirect(pendingBiometricUser);
        }
      } catch (error) {
        console.error('Biometric enrollment error:', error);
        showMessage('Could not enable biometric sign-in. Proceeding with regular login.', 'warning');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await handleUserRedirect(pendingBiometricUser);
      }
      
      pendingBiometricUser = null;
      pendingBiometricSession = null;
    }
    
    async function skipBiometricEnrollment() {
      localStorage.setItem('mcc_biometric_declined', 'true');
      
      if (pendingBiometricUser) {
        await handleUserRedirect(pendingBiometricUser);
      } else {
        showScreen('login-form-container');
      }
      
      pendingBiometricUser = null;
      pendingBiometricSession = null;
    }
    
    // Handle redirect from protected pages requiring 2FA verification
    async function handle2faRequiredRedirect(user) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showScreen('login-form-container');
          showMessage('Session expired. Please log in again.');
          return;
        }
        
        // Check 2FA status and get phone
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/status`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (!result.success || !result.enabled) {
          // 2FA not enabled, redirect back
          await handleUserRedirect(user);
          return;
        }
        
        // If recently verified, redirect back
        if (result.recently_verified) {
          await handleUserRedirect(user);
          return;
        }
        
        // Get phone for 2FA
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .single();
        
        if (!profile?.phone) {
          showMessage('2FA is enabled but no phone number is configured.');
          await handleUserRedirect(user);
          return;
        }
        
        pending2faUser = user;
        pending2faPhone = profile.phone;
        
        // Send 2FA code
        const sendResult = await send2faCode(profile.phone);
        
        if (sendResult.success) {
          document.getElementById('twofa-phone-display').textContent = sendResult.phone || maskPhone(profile.phone);
          showScreen('twofa-screen');
          setup2faInputs();
          clear2faInputs();
          startResendCountdown();
        } else {
          showMessage(sendResult.error || 'Failed to send verification code', 'error');
        }
      } catch (error) {
        console.error('2FA required redirect error:', error);
        showMessage('Error initiating 2FA verification.');
      }
    }
    
    // Helper to mask phone for display
    function maskPhone(phone) {
      if (!phone || phone.length < 4) return '****';
      return '*'.repeat(phone.length - 4) + phone.slice(-4);
    }

    function showMessage(text, type = 'error') {
      messageEl.textContent = text;
      messageEl.className = `login-message show ${type}`;
    }

    function setLoading(loading) {
      loginBtn.disabled = loading;
      const signingInText = I18n && I18n.t ? I18n.t('auth.signingIn') : 'Signing in...';
      const signInText = I18n && I18n.t ? I18n.t('auth.signInButton') : 'Sign In';
      loginBtn.innerHTML = loading ? '<span class="spinner"></span>' + signingInText : signInText;
    }

    function showScreen(screenId) {
      document.getElementById('login-form-container').style.display = 'none';
      document.getElementById('pending-screen').style.display = 'none';
      document.getElementById('portal-selection-screen').style.display = 'none';
      document.getElementById('twofa-screen').style.display = 'none';
      document.getElementById('biometric-enroll-screen').style.display = 'none';
      document.getElementById('magic-link-sent').style.display = 'none';
      document.getElementById(screenId).style.display = 'block';
    }

    async function handleUserRedirect(user) {
      // Check for returnTo parameter (from 2FA required redirect)
      const urlParams = getUrlParams();
      const returnTo = urlParams.returnTo;
      
      // If there's a valid returnTo path, redirect there after verification
      if (returnTo && returnTo.startsWith('/') && !returnTo.includes('login')) {
        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = returnTo;
        return;
      }
      
      let { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role, is_also_member, is_also_provider')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Task #318: honor `mcc_signup_intent='provider'` set by the
        // Facebook button on signup-provider.html / onboarding-provider.html
        // so brand-new OAuth users started from a provider surface land
        // on the provider survey with role=pending_provider, not the
        // default member onboarding.
        let signupIntent = null;
        try { signupIntent = localStorage.getItem('mcc_signup_intent'); } catch (_e) { /* ignore */ }
        const isProviderIntent = signupIntent === 'provider';

        // Task #341: capture the active UI language at OAuth signup so
        // day-one transactional emails (welcome, magic link, BGC
        // launch) go out in the language the user was browsing in.
        // Reads i18n.js's storage key directly; null falls back to EN
        // downstream and matches existing pre-#341 signups.
        let preferredLanguage = null;
        try {
          const stored = (localStorage.getItem('mcc_language') || '').toLowerCase();
          if (['en','es','fr','el','zh','hi','ar'].includes(stored)) preferredLanguage = stored;
        } catch (_e) { /* ignore */ }

        console.log('Creating profile for new OAuth user:', user.email, 'intent:', signupIntent || 'member');
        const { data: newProfile, error: createError } = await supabaseClient
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            role: isProviderIntent ? 'pending_provider' : 'member',
            is_also_member: isProviderIntent ? true : undefined,
            preferred_language: preferredLanguage,
            created_at: new Date().toISOString()
          })
          .select('role, is_also_member, is_also_provider')
          .single();
        
        if (createError) {
          console.error('Failed to create profile:', createError);
          showMessage('Unable to complete sign-in. Please try again.');
          return;
        }
        profile = newProfile;
        error = null;

        // Brand-new Facebook signups go through the onboarding survey,
        // matching the email signup experience. Provider-intent users
        // get routed to the provider survey instead of the member one.
        // Task #326: Apple OAuth follows the same routing as Facebook
        // (iOS App Store parity) — provider-intent Apple signups land
        // on the provider survey with role='pending_provider' instead
        // of the default member onboarding.
        if (urlParams.oauth === 'facebook' || urlParams.oauth === 'apple') {
          const oauthSource = urlParams.oauth;
          if (isProviderIntent) {
            try { localStorage.removeItem('mcc_signup_intent'); } catch (_e) { /* ignore */ }
            localStorage.setItem('mcc_portal', 'provider');
            await new Promise(resolve => setTimeout(resolve, 300));
            window.location.href = 'onboarding-provider.html?source=' + oauthSource;
            return;
          }
          localStorage.setItem('mcc_portal', 'member');
          await new Promise(resolve => setTimeout(resolve, 300));
          window.location.href = 'onboarding-member.html?source=' + oauthSource;
          return;
        }
      }

      if (error || !profile) {
        console.error('Profile load error:', error);
        showMessage('Unable to load profile. Please try again.');
        return;
      }

      supabaseClient.auth.getSession().then(({ data }) => {
        if (data?.session?.access_token) {
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          fetch(`${apiBase}/api/email/welcome`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.session.access_token}`
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      const isMember = profile.role === 'member' || profile.role === 'admin' || profile.is_also_member;
      const isProvider = profile.role === 'provider' || profile.is_also_provider;
      const isPendingProvider = profile.role === 'pending_provider';

      if (isPendingProvider && !profile.is_also_member) {
        showScreen('pending-screen');
        return;
      }

      if (isMember && isProvider) {
        showScreen('portal-selection-screen');
        return;
      }

      if (isPendingProvider && profile.is_also_member) {
        window.location.href = 'members.html';
        return;
      }

      if (isProvider) {
        localStorage.setItem('mcc_portal', 'provider');
        // Small delay to ensure session is saved to localStorage
        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = 'providers.html';
      } else if (profile.role === 'admin') {
        localStorage.setItem('mcc_portal', 'admin');
        // Small delay to ensure session is saved to localStorage
        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = 'admin.html';
      } else {
        localStorage.setItem('mcc_portal', 'member');
        // Small delay to ensure session is saved to localStorage
        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = 'members.html';
      }
    }

    function selectPortal(portal) {
      localStorage.setItem('mcc_portal', portal);
      if (portal === 'provider') {
        window.location.href = 'providers.html';
      } else {
        window.location.href = 'members.html';
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;


      if (!email || !password) {
        return showMessage('Please enter email and password.');
      }

      setLoading(true);

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


      if (error) {
        setLoading(false);
        const friendlyMsg = (error.message || '').toLowerCase().includes('invalid') 
          ? 'Incorrect email or password. Please try again.'
          : 'Unable to sign in. Please try again.';
        return showMessage(friendlyMsg);
      }

      if (data.user) {
        await check2faAndProceed(data.user);
      }

      setLoading(false);
    });

    async function logout() {
      localStorage.removeItem('mcc_portal');
      if (typeof BiometricAuth !== 'undefined') {
        await BiometricAuth.disableBiometric();
      }
      await supabaseClient.auth.signOut();
      showScreen('login-form-container');
      await initBiometricUI();
    }

    // 2FA State
    let pending2faUser = null;
    let pending2faPhone = null;
    let resendCountdown = 0;
    let resendTimer = null;

    function show2faMessage(text, type = 'error') {
      const msgEl = document.getElementById('twofa-message');
      msgEl.textContent = text;
      msgEl.className = `login-message show ${type}`;
    }

    function hide2faMessage() {
      const msgEl = document.getElementById('twofa-message');
      msgEl.className = 'login-message';
    }

    function clear2faInputs() {
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`code-${i}`);
        input.value = '';
        input.classList.remove('filled', 'error');
      }
      document.getElementById('code-1').focus();
    }

    function get2faCode() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        code += document.getElementById(`code-${i}`).value;
      }
      return code;
    }

    function setup2faInputs() {
      const inputs = document.querySelectorAll('.code-input');
      
      inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          const value = e.target.value.replace(/[^0-9]/g, '');
          e.target.value = value;
          
          if (value) {
            e.target.classList.add('filled');
            if (index < 5) {
              inputs[index + 1].focus();
            }
          } else {
            e.target.classList.remove('filled');
          }
          
          const fullCode = get2faCode();
          if (fullCode.length === 6) {
            verify2faCode();
          }
        });
        
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && index > 0) {
            inputs[index - 1].focus();
          }
        });
        
        input.addEventListener('paste', (e) => {
          e.preventDefault();
          const pastedData = (e.clipboardData || window.clipboardData).getData('text');
          const digits = pastedData.replace(/[^0-9]/g, '').slice(0, 6);
          
          digits.split('').forEach((digit, i) => {
            if (inputs[i]) {
              inputs[i].value = digit;
              inputs[i].classList.add('filled');
            }
          });
          
          if (digits.length > 0) {
            const focusIndex = Math.min(digits.length, 5);
            inputs[focusIndex].focus();
          }
          
          if (digits.length === 6) {
            verify2faCode();
          }
        });
      });
    }

    function startResendCountdown() {
      resendCountdown = 60;
      const resendLink = document.getElementById('resend-link');
      const countdownEl = document.getElementById('resend-countdown');
      
      resendLink.classList.add('disabled');
      
      if (resendTimer) clearInterval(resendTimer);
      
      resendTimer = setInterval(() => {
        resendCountdown--;
        if (resendCountdown > 0) {
          countdownEl.textContent = `You can resend in ${resendCountdown}s`;
        } else {
          countdownEl.textContent = '';
          resendLink.classList.remove('disabled');
          clearInterval(resendTimer);
        }
      }, 1000);
    }

    async function send2faCode(phone) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/send-code`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone })
        });
        
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Error sending 2FA code:', error);
        return { success: false, error: 'Failed to send verification code' };
      }
    }

    async function verify2faCode() {
      const code = get2faCode();
      
      if (code.length !== 6) {
        show2faMessage('Please enter all 6 digits');
        return;
      }
      
      const verifyBtn = document.getElementById('verify-btn');
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<span class="spinner"></span>Verifying...';
      hide2faMessage();
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          show2faMessage('Session expired. Please log in again.');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/verify-code`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code })
        });
        
        const result = await response.json();
        
        if (result.success && result.verified) {
          show2faMessage('Verification successful!', 'success');
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
          const offered = await checkBiometricEnrollmentOffer(pending2faUser, currentSession);
          if (!offered) {
            await handleUserRedirect(pending2faUser);
          }
        } else {
          document.querySelectorAll('.code-input').forEach(input => {
            input.classList.add('error');
          });
          show2faMessage(result.error || 'Invalid verification code');
          setTimeout(() => {
            document.querySelectorAll('.code-input').forEach(input => {
              input.classList.remove('error');
            });
          }, 500);
        }
      } catch (error) {
        console.error('2FA verification error:', error);
        show2faMessage('Verification failed. Please try again.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = 'Verify Code';
      }
    }

    async function resend2faCode() {
      if (resendCountdown > 0) return;
      
      if (!pending2faUser || !pending2faPhone) {
        show2faMessage('Session expired. Please log in again.');
        return;
      }
      
      show2faMessage('Sending new code...', 'warning');
      
      const result = await send2faCode(pending2faPhone);
      
      if (result.success) {
        show2faMessage('New code sent!', 'success');
        clear2faInputs();
        startResendCountdown();
        setTimeout(hide2faMessage, 2000);
      } else {
        show2faMessage(result.error || 'Failed to resend code');
      }
    }

    function back2faToLogin() {
      pending2faUser = null;
      pending2faPhone = null;
      if (resendTimer) clearInterval(resendTimer);
      supabaseClient.auth.signOut();
      showScreen('login-form-container');
    }

    async function check2faAndProceed(user) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showMessage('Session expired. Please log in again.', 'error');
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/2fa/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const result = await response.json();
        
        if (result.success && result.enabled) {
          // If recently verified (within 1 hour), skip 2FA
          if (result.recently_verified) {
            await logLoginActivityClient(session.access_token);
            const offered = await checkBiometricEnrollmentOffer(user, session);
            if (!offered) {
              await handleUserRedirect(user);
            }
            return;
          }
          
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('phone')
            .eq('id', user.id)
            .single();
          
          if (!profile?.phone) {
            await handleUserRedirect(user);
            return;
          }
          
          pending2faUser = user;
          pending2faPhone = profile.phone;
          
          const sendResult = await send2faCode(profile.phone);
          
          if (sendResult.success) {
            document.getElementById('twofa-phone-display').textContent = result.phone;
            showScreen('twofa-screen');
            setup2faInputs();
            clear2faInputs();
            startResendCountdown();
          } else {
            showMessage(sendResult.error || 'Failed to send verification code', 'error');
            await supabaseClient.auth.signOut();
          }
        } else {
          // No 2FA enabled, log login activity directly
          await logLoginActivityClient(session.access_token);
          const offered = await checkBiometricEnrollmentOffer(user, session);
          if (!offered) {
            await handleUserRedirect(user);
          }
        }
      } catch (error) {
        console.error('2FA check error:', error);
        await handleUserRedirect(user);
      }
    }
    
    // Sign in with Apple OAuth
    async function signInWithApple() {
      const appleBtn = document.getElementById('apple-signin-btn');
      if (appleBtn) {
        appleBtn.disabled = true;
        appleBtn.innerHTML = '<span class="spinner"></span>Connecting...';
      }
      
      try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: window.location.origin + '/login.html?oauth=apple',
            scopes: 'name email'
          }
        });
        
        if (error) {
          console.error('Apple Sign In error:', error);
          showMessage('Failed to connect to Apple. Please try again.', 'error');
          if (appleBtn) {
            appleBtn.disabled = false;
            appleBtn.innerHTML = '<svg class="apple-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg><span>Sign in with Apple</span>';
          }
        }
        // If successful, user will be redirected to Apple
      } catch (err) {
        console.error('Apple Sign In exception:', err);
        showMessage('An error occurred. Please try again.', 'error');
        if (appleBtn) {
          appleBtn.disabled = false;
          appleBtn.innerHTML = '<svg class="apple-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg><span>Sign in with Apple</span>';
        }
      }
    }
    
    // Make signInWithApple available globally
    window.signInWithApple = signInWithApple;

    // Sign in with Facebook OAuth
    const FACEBOOK_BTN_ICON_SVG = '<svg class="facebook-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';

    function resetFacebookButton(btn) {
      if (!btn) return;
      btn.disabled = false;
      btn.innerHTML = FACEBOOK_BTN_ICON_SVG + '<span>Continue with Facebook</span>';
    }

    async function signInWithFacebook() {
      const fbBtn = document.getElementById('facebook-signin-btn');
      if (fbBtn) {
        fbBtn.disabled = true;
        fbBtn.innerHTML = '<span class="spinner"></span>Connecting...';
      }

      try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'facebook',
          options: {
            redirectTo: window.location.origin + '/login.html?oauth=facebook',
            scopes: 'email,public_profile'
          }
        });

        if (error) {
          console.error('Facebook Sign In error:', error);
          showMessage('Failed to connect to Facebook. Please try again.', 'error');
          resetFacebookButton(fbBtn);
        }
        // If successful, browser redirects to facebook.com
      } catch (err) {
        console.error('Facebook Sign In exception:', err);
        showMessage('An error occurred. Please try again.', 'error');
        resetFacebookButton(fbBtn);
      }
    }

    // Make signInWithFacebook available globally
    window.signInWithFacebook = signInWithFacebook;
    
    let magicResendCountdown = 0;
    let magicResendTimer = null;
    let lastMagicLinkEmail = '';

    function switchLoginTab(tab) {
      const tabPassword = document.getElementById('tab-password');
      const tabMagic = document.getElementById('tab-magic');
      const passwordGroup = document.getElementById('password').closest('.form-group');
      const loginBtnEl = document.getElementById('login-btn');
      const magicLinkBtn = document.getElementById('magic-link-btn');

      tabPassword.classList.remove('active');
      tabMagic.classList.remove('active');

      if (tab === 'password') {
        tabPassword.classList.add('active');
        passwordGroup.style.display = 'block';
        loginBtnEl.style.display = 'block';
        magicLinkBtn.style.display = 'none';
      } else {
        tabMagic.classList.add('active');
        passwordGroup.style.display = 'none';
        loginBtnEl.style.display = 'none';
        magicLinkBtn.style.display = 'block';
      }

      messageEl.className = 'login-message';
    }

    async function sendMagicLink() {
      const email = document.getElementById('email').value.trim();
      if (!email) {
        showMessage('Please enter your email address.');
        return;
      }

      const magicBtn = document.getElementById('magic-link-btn');
      magicBtn.disabled = true;
      magicBtn.innerHTML = '<span class="spinner"></span>Sending...';

      try {
        const { error } = await supabaseClient.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin + '/login.html'
          }
        });

        if (error) {
          showMessage(error.message || 'Failed to send magic link. Please try again.');
          magicBtn.disabled = false;
          magicBtn.innerHTML = 'Send Magic Link';
          return;
        }

        lastMagicLinkEmail = email;
        document.getElementById('magic-link-email-display').textContent = email;
        document.getElementById('login-form-container').style.display = 'none';
        document.getElementById('magic-link-sent').style.display = 'block';
        startMagicResendCountdown();
      } catch (err) {
        showMessage('An error occurred. Please try again.');
        magicBtn.disabled = false;
        magicBtn.innerHTML = 'Send Magic Link';
      }
    }

    function startMagicResendCountdown() {
      magicResendCountdown = 60;
      const resendLink = document.getElementById('magic-resend-link');
      const countdownEl = document.getElementById('magic-resend-countdown');

      resendLink.classList.add('disabled');

      if (magicResendTimer) clearInterval(magicResendTimer);

      magicResendTimer = setInterval(() => {
        magicResendCountdown--;
        if (magicResendCountdown > 0) {
          countdownEl.textContent = `You can resend in ${magicResendCountdown}s`;
        } else {
          countdownEl.textContent = '';
          resendLink.classList.remove('disabled');
          clearInterval(magicResendTimer);
        }
      }, 1000);
    }

    async function resendMagicLink() {
      if (magicResendCountdown > 0) return;

      if (!lastMagicLinkEmail) {
        showMagicLinkForm();
        return;
      }

      const resendLink = document.getElementById('magic-resend-link');
      resendLink.textContent = 'Sending...';
      resendLink.classList.add('disabled');

      try {
        const { error } = await supabaseClient.auth.signInWithOtp({
          email: lastMagicLinkEmail,
          options: {
            emailRedirectTo: window.location.origin + '/login.html'
          }
        });

        if (error) {
          showMessage('Failed to resend. Please try again.');
          resendLink.textContent = 'Resend magic link';
          resendLink.classList.remove('disabled');
          return;
        }

        resendLink.textContent = 'Resend magic link';
        startMagicResendCountdown();
      } catch (err) {
        showMessage('Failed to resend. Please try again.');
        resendLink.textContent = 'Resend magic link';
        resendLink.classList.remove('disabled');
      }
    }

    function showMagicLinkForm() {
      document.getElementById('magic-link-sent').style.display = 'none';
      document.getElementById('login-form-container').style.display = 'block';
      if (magicResendTimer) clearInterval(magicResendTimer);
      switchLoginTab('magic');
    }

    window.switchLoginTab = switchLoginTab;
    window.sendMagicLink = sendMagicLink;
    window.resendMagicLink = resendMagicLink;
    window.showMagicLinkForm = showMagicLinkForm;

    async function logLoginActivityClient(accessToken, isSuccessful = true, failureReason = null) {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        await fetch(`${apiBase}/api/log-login-activity`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            is_successful: isSuccessful,
            failure_reason: failureReason
          })
        });
      } catch (error) {
        console.error('Failed to log login activity:', error);
      }
    }
