/**
 * My Car Concierge - Mobile Payment Integration
 * Apple Pay and Google Pay support for Capacitor native apps
 * 
 * SETUP REQUIREMENTS:
 * 1. Apple Pay: Register merchant ID in Apple Developer Portal, add domain verification
 * 2. Google Pay: Configure in Google Pay Business Console
 * 3. Stripe: Enable Apple Pay and Google Pay in Stripe Dashboard settings
 * 4. Install Capacitor Stripe plugin: npm install @capacitor-community/stripe
 * 
 * These payment methods integrate with Stripe's Payment Request API for unified wallet handling.
 */

const MobilePay = (function() {
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  const isIOS = isNative && Capacitor.getPlatform() === 'ios';
  const isAndroid = isNative && Capacitor.getPlatform() === 'android';
  const ENVIRONMENT = 'PRODUCTION'; // Set to 'TEST' for sandbox testing
  let stripeInitialized = false;

  async function initializeStripe() {
    if (stripeInitialized) return true;
    
    try {
      if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Stripe) {
        const Stripe = Capacitor.Plugins.Stripe;
        await Stripe.initialize({
          publishableKey: window.STRIPE_PUBLISHABLE_KEY || ''
        });
        stripeInitialized = true;
        console.log('[MobilePay] Stripe Capacitor plugin initialized');
        return true;
      }
    } catch (e) {
      console.error('[MobilePay] Stripe initialization error:', e);
    }
    return false;
  }

  if (isNative) {
    document.addEventListener('DOMContentLoaded', initializeStripe);
  }

  async function isApplePayAvailable() {
    if (!isIOS) return false;
    
    try {
      if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.CapacitorStripePay) {
        const result = await Capacitor.Plugins.CapacitorStripePay.isApplePayAvailable();
        return result?.available === true;
      }
      
      if (typeof ApplePaySession !== 'undefined' && ApplePaySession.canMakePayments()) {
        return true;
      }
    } catch (e) {
      console.log('Apple Pay check error:', e);
    }
    
    return false;
  }

  async function isGooglePayAvailable() {
    if (!isAndroid) return false;
    
    try {
      if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.CapacitorStripePay) {
        const result = await Capacitor.Plugins.CapacitorStripePay.isGooglePayAvailable();
        return result?.available === true;
      }
      
      if (typeof google !== 'undefined' && google.payments && google.payments.api) {
        const paymentsClient = new google.payments.api.PaymentsClient({ environment: ENVIRONMENT });
        const isReadyToPayRequest = {
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER']
            }
          }]
        };
        const response = await paymentsClient.isReadyToPay(isReadyToPayRequest);
        return response.result === true;
      }
    } catch (e) {
      console.log('Google Pay check error:', e);
    }
    
    return false;
  }

  async function requestApplePay(amount, description) {
    if (!isIOS) {
      return { success: false, error: 'Apple Pay is only available on iOS devices' };
    }

    try {
      if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.CapacitorStripePay) {
        const result = await Capacitor.Plugins.CapacitorStripePay.presentApplePay({
          merchantId: 'merchant.com.mycarconcierge',
          countryCode: 'US',
          currencyCode: 'USD',
          paymentSummaryItems: [{
            label: description || 'My Car Concierge',
            amount: amount.toFixed(2)
          }]
        });
        
        if (result.paymentMethod) {
          return { 
            success: true, 
            paymentMethodId: result.paymentMethod.id,
            type: 'apple_pay'
          };
        }
        return { success: false, error: result.error || 'Payment cancelled' };
      }

      if (typeof ApplePaySession !== 'undefined') {
        return new Promise((resolve) => {
          const request = {
            countryCode: 'US',
            currencyCode: 'USD',
            supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
            merchantCapabilities: ['supports3DS'],
            total: {
              label: description || 'My Car Concierge',
              amount: amount.toFixed(2)
            }
          };
          
          const session = new ApplePaySession(3, request);
          
          session.onvalidatemerchant = async (event) => {
            try {
              const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
              const response = await fetch(`${apiBase}/api/apple-pay/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ validationURL: event.validationURL })
              });
              const merchantSession = await response.json();
              session.completeMerchantValidation(merchantSession);
            } catch (e) {
              session.abort();
              resolve({ success: false, error: 'Merchant validation failed' });
            }
          };
          
          session.onpaymentauthorized = async (event) => {
            try {
              const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
              const response = await fetch(`${apiBase}/api/apple-pay/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  token: event.payment.token,
                  amount: amount
                })
              });
              const result = await response.json();
              
              if (result.success) {
                session.completePayment(ApplePaySession.STATUS_SUCCESS);
                resolve({ 
                  success: true, 
                  paymentMethodId: result.paymentMethodId,
                  type: 'apple_pay'
                });
              } else {
                session.completePayment(ApplePaySession.STATUS_FAILURE);
                resolve({ success: false, error: result.error });
              }
            } catch (e) {
              session.completePayment(ApplePaySession.STATUS_FAILURE);
              resolve({ success: false, error: e.message });
            }
          };
          
          session.oncancel = () => {
            resolve({ success: false, error: 'Payment cancelled' });
          };
          
          session.begin();
        });
      }
    } catch (e) {
      console.error('Apple Pay error:', e);
      return { success: false, error: e.message };
    }

    return { success: false, error: 'Apple Pay not available' };
  }

  async function requestGooglePay(amount, description) {
    if (!isAndroid) {
      return { success: false, error: 'Google Pay is only available on Android devices' };
    }

    try {
      if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.CapacitorStripePay) {
        const result = await Capacitor.Plugins.CapacitorStripePay.presentGooglePay({
          merchantName: 'My Car Concierge',
          countryCode: 'US',
          currencyCode: 'USD',
          totalPrice: amount.toFixed(2),
          totalPriceLabel: description || 'Total'
        });
        
        if (result.paymentMethod) {
          return { 
            success: true, 
            paymentMethodId: result.paymentMethod.id,
            type: 'google_pay'
          };
        }
        return { success: false, error: result.error || 'Payment cancelled' };
      }

      if (typeof google !== 'undefined' && google.payments && google.payments.api) {
        const paymentsClient = new google.payments.api.PaymentsClient({ environment: 'PRODUCTION' });
        
        const paymentDataRequest = {
          apiVersion: 2,
          apiVersionMinor: 0,
          merchantInfo: {
            merchantId: 'BCR2DN4TWWCS3HN7',
            merchantName: 'My Car Concierge'
          },
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER']
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'stripe',
                'stripe:version': '2020-08-27',
                'stripe:publishableKey': window.STRIPE_PUBLISHABLE_KEY || ''
              }
            }
          }],
          transactionInfo: {
            totalPriceStatus: 'FINAL',
            totalPrice: amount.toFixed(2),
            currencyCode: 'USD',
            countryCode: 'US'
          }
        };

        const paymentData = await paymentsClient.loadPaymentData(paymentDataRequest);
        const paymentToken = JSON.parse(paymentData.paymentMethodData.tokenizationData.token);
        
        return { 
          success: true, 
          paymentMethodId: paymentToken.id,
          type: 'google_pay'
        };
      }
    } catch (e) {
      console.error('Google Pay error:', e);
      if (e.statusCode === 'CANCELED') {
        return { success: false, error: 'Payment cancelled' };
      }
      return { success: false, error: e.message };
    }

    return { success: false, error: 'Google Pay not available' };
  }

  function getPlatformInfo() {
    return {
      isNative,
      isIOS,
      isAndroid,
      isWeb: !isNative
    };
  }

  function getMobilePayButtonsHTML(amount, description, containerId) {
    const platform = getPlatformInfo();
    
    if (platform.isWeb) {
      return '';
    }

    let html = '<div class="mobile-pay-buttons" style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">';
    
    if (platform.isIOS) {
      html += `
        <button id="${containerId}-apple-pay" class="apple-pay-button" onclick="MobilePay.handleApplePay(${amount}, '${description}', '${containerId}')" style="display:none;width:100%;height:48px;background:#000;border:none;border-radius:8px;cursor:pointer;position:relative;overflow:hidden;">
          <span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
            <svg width="20" height="24" viewBox="0 0 20 24" fill="white" style="margin-top:-2px;">
              <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2.06a4.44 4.44 0 0 0-2.91 1.49A4.17 4.17 0 0 0 12 6.54a3.71 3.71 0 0 0 2.94-1.35zm1.68 2.81c-1.68.09-3.12.94-3.95.94s-2.05-.89-3.38-.87a5 5 0 0 0-4.27 2.57c-1.82 3.14-.47 7.79 1.31 10.34.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.84 3.38-.84s2 .84 3.38.81 2.3-1.26 3.17-2.53a11.08 11.08 0 0 0 1.43-2.94 4.52 4.52 0 0 1-2.72-4.13 4.65 4.65 0 0 1 2.22-3.9 4.77 4.77 0 0 0-3.83-1.07z"/>
            </svg>
            Pay
          </span>
        </button>
      `;
    }
    
    if (platform.isAndroid) {
      html += `
        <button id="${containerId}-google-pay" class="google-pay-button" onclick="MobilePay.handleGooglePay(${amount}, '${description}', '${containerId}')" style="display:none;width:100%;height:48px;background:#000;border:none;border-radius:8px;cursor:pointer;">
          <span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Pay
          </span>
        </button>
      `;
    }
    
    html += '</div>';
    return html;
  }

  async function initMobilePayButtons(containerId) {
    const platform = getPlatformInfo();
    if (platform.isWeb) return;

    if (platform.isIOS) {
      const appleBtn = document.getElementById(`${containerId}-apple-pay`);
      if (appleBtn) {
        const available = await isApplePayAvailable();
        appleBtn.style.display = available ? 'block' : 'none';
      }
    }

    if (platform.isAndroid) {
      const googleBtn = document.getElementById(`${containerId}-google-pay`);
      if (googleBtn) {
        const available = await isGooglePayAvailable();
        googleBtn.style.display = available ? 'block' : 'none';
      }
    }
  }

  async function handleApplePay(amount, description, containerId) {
    const btn = document.getElementById(`${containerId}-apple-pay`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span style="color:#fff;">Processing...</span>';
    }

    const result = await requestApplePay(amount, description);
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
        <svg width="20" height="24" viewBox="0 0 20 24" fill="white" style="margin-top:-2px;">
          <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2.06a4.44 4.44 0 0 0-2.91 1.49A4.17 4.17 0 0 0 12 6.54a3.71 3.71 0 0 0 2.94-1.35zm1.68 2.81c-1.68.09-3.12.94-3.95.94s-2.05-.89-3.38-.87a5 5 0 0 0-4.27 2.57c-1.82 3.14-.47 7.79 1.31 10.34.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.84 3.38-.84s2 .84 3.38.81 2.3-1.26 3.17-2.53a11.08 11.08 0 0 0 1.43-2.94 4.52 4.52 0 0 1-2.72-4.13 4.65 4.65 0 0 1 2.22-3.9 4.77 4.77 0 0 0-3.83-1.07z"/>
        </svg>
        Pay
      </span>`;
    }

    if (result.success && window.MobilePayCallbacks && window.MobilePayCallbacks[containerId]) {
      window.MobilePayCallbacks[containerId](result);
    } else if (!result.success && result.error !== 'Payment cancelled') {
      if (typeof showToast === 'function') {
        showToast(result.error || 'Apple Pay failed', 'error');
      }
    }
    
    return result;
  }

  async function handleGooglePay(amount, description, containerId) {
    const btn = document.getElementById(`${containerId}-google-pay`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span style="color:#fff;">Processing...</span>';
    }

    const result = await requestGooglePay(amount, description);
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:16px;font-weight:500;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Pay
      </span>`;
    }

    if (result.success && window.MobilePayCallbacks && window.MobilePayCallbacks[containerId]) {
      window.MobilePayCallbacks[containerId](result);
    } else if (!result.success && result.error !== 'Payment cancelled') {
      if (typeof showToast === 'function') {
        showToast(result.error || 'Google Pay failed', 'error');
      }
    }
    
    return result;
  }

  function registerCallback(containerId, callback) {
    if (!window.MobilePayCallbacks) {
      window.MobilePayCallbacks = {};
    }
    window.MobilePayCallbacks[containerId] = callback;
  }

  return {
    initializeStripe,
    isApplePayAvailable,
    isGooglePayAvailable,
    requestApplePay,
    requestGooglePay,
    getPlatformInfo,
    getMobilePayButtonsHTML,
    initMobilePayButtons,
    handleApplePay,
    handleGooglePay,
    registerCallback
  };
})();

window.MobilePay = MobilePay;
