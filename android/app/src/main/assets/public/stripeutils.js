/**
 * My Car Concierge - Stripe Integration Utilities
 * 
 * This file contains client-side Stripe integration helpers.
 * In production, sensitive operations should be handled server-side.
 * 
 * Required Stripe products:
 * - Stripe.js for client-side
 * - Stripe Connect for provider payouts
 * - PaymentIntents API for auth/capture flow
 */

// Stripe publishable key - fetched from server
let STRIPE_PUBLISHABLE_KEY = null;
let stripeKeyPromise = null;

// Fetch publishable key from server (cached)
async function fetchStripeKey() {
  if (STRIPE_PUBLISHABLE_KEY) return STRIPE_PUBLISHABLE_KEY;
  if (stripeKeyPromise) return stripeKeyPromise;
  
  stripeKeyPromise = fetch('/api/config/stripe')
    .then(res => res.json())
    .then(data => {
      STRIPE_PUBLISHABLE_KEY = data.publishableKey;
      return STRIPE_PUBLISHABLE_KEY;
    })
    .catch(err => {
      console.error('Failed to fetch Stripe config:', err);
      return null;
    });
  
  return stripeKeyPromise;
}

// Initialize Stripe
let stripe = null;

async function initStripe() {
  if (stripe) return stripe;
  
  if (typeof Stripe === 'undefined') {
    console.error('Stripe.js not loaded');
    return null;
  }
  
  const key = await fetchStripeKey();
  if (key && !stripe) {
    stripe = Stripe(key);
  }
  return stripe;
}

// Synchronous version for backward compatibility (uses cached key)
function initStripeSync() {
  if (stripe) return stripe;
  if (typeof Stripe !== 'undefined' && STRIPE_PUBLISHABLE_KEY) {
    stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripe;
}

/**
 * MCC Fee Structure
 */
const MCC_FEE_PERCENT = 0.075; // 7.5%

function calculateFees(totalAmount) {
  const mccFee = totalAmount * MCC_FEE_PERCENT;
  const providerAmount = totalAmount - mccFee;
  // Stripe fee is ~2.9% + $0.30, but charged to MCC
  const stripeFee = (totalAmount * 0.029) + 0.30;
  const netMccRevenue = mccFee - stripeFee;
  
  return {
    totalAmount: totalAmount,
    mccFee: Math.round(mccFee * 100) / 100,
    providerAmount: Math.round(providerAmount * 100) / 100,
    stripeFee: Math.round(stripeFee * 100) / 100,
    netMccRevenue: Math.round(netMccRevenue * 100) / 100
  };
}

/**
 * Escrow Payment Flow Functions
 * 
 * Complete escrow payment system for marketplace bids:
 * 1. Create escrow payment intent (holds funds)
 * 2. Confirm payment (authorizes card, holds funds)
 * 3. Release payment (captures funds, transfers to provider)
 * 4. Refund payment (cancels hold, returns funds to customer)
 */

// Step 1: Create escrow PaymentIntent when bid is accepted
// Note: Amount is derived server-side from the bid price for security
async function createEscrowPayment(packageId, bidId) {
  const response = await fetch('/api/escrow/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_id: packageId,
      bid_id: bidId
    })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to create escrow payment');
  }
  return data;
}

// Step 2: Confirm payment with card element (authorizes the card)
async function confirmEscrowPayment(clientSecret, cardElement) {
  const stripe = await initStripe();
  if (!stripe) {
    throw new Error('Stripe not initialized');
  }
  
  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
    }
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return paymentIntent;
}

// Step 2b: Confirm payment with Payment Element (for modern checkout)
async function confirmEscrowPaymentElement(clientSecret, elements, returnUrl) {
  const stripe = await initStripe();
  if (!stripe) {
    throw new Error('Stripe not initialized');
  }
  
  const { error, paymentIntent } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: returnUrl || window.location.href
    },
    redirect: 'if_required'
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return paymentIntent;
}

// Step 3: Mark payment as held in database after card is authorized
async function confirmEscrowHeld(packageId) {
  const response = await fetch(`/api/escrow/confirm/${packageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to confirm escrow');
  }
  return data;
}

// Step 4: Release payment to provider (when work is confirmed complete)
async function releaseEscrowPayment(packageId) {
  const response = await fetch(`/api/escrow/release/${packageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to release payment');
  }
  return data;
}

// Step 5: Refund/cancel escrow payment
async function refundEscrowPayment(packageId, reason) {
  const response = await fetch(`/api/escrow/refund/${packageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to refund payment');
  }
  return data;
}

// Get escrow status for a package
async function getEscrowStatus(packageId) {
  const response = await fetch(`/api/escrow/status/${packageId}`);
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to get escrow status');
  }
  return data;
}

// Legacy compatibility functions
async function confirmPayment(clientSecret, cardElement) {
  return confirmEscrowPayment(clientSecret, cardElement);
}

async function capturePayment(paymentIntentId) {
  console.warn('capturePayment is deprecated, use releaseEscrowPayment(packageId) instead');
  return { error: 'Use releaseEscrowPayment(packageId) instead' };
}

async function cancelPayment(paymentIntentId, reason) {
  console.warn('cancelPayment is deprecated, use refundEscrowPayment(packageId, reason) instead');
  const response = await fetch('/api/payments/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_intent_id: paymentIntentId,
      reason: reason
    })
  });
  
  return response.json();
}

/**
 * Stripe Connect Functions (for provider payouts)
 */

// Create Connect account for provider
async function createConnectAccount(providerId, email, businessName) {
  const response = await fetch('/api/connect/create-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider_id: providerId,
      email: email,
      business_name: businessName,
      type: 'express' // Express accounts are easiest for providers
    })
  });
  
  return response.json();
}

// Get onboarding link for provider
async function getConnectOnboardingLink(accountId) {
  const response = await fetch('/api/connect/onboarding-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: accountId,
      return_url: window.location.origin + '/providers.html?stripe_onboarded=true',
      refresh_url: window.location.origin + '/providers.html?stripe_refresh=true'
    })
  });
  
  return response.json();
}

// Transfer funds to provider
async function transferToProvider(amount, providerConnectId, paymentId) {
  const response = await fetch('/api/connect/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(amount * 100), // Stripe uses cents
      destination: providerConnectId,
      payment_id: paymentId,
      description: 'MCC service payment'
    })
  });
  
  return response.json();
}

/**
 * Payment Method Management
 */

// Create card element
function createCardElement(containerId) {
  const stripe = initStripe();
  const elements = stripe.elements();
  
  const style = {
    base: {
      color: '#f4f4f6',
      fontFamily: 'Outfit, -apple-system, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#6b6b7a'
      }
    },
    invalid: {
      color: '#ef5f5f',
      iconColor: '#ef5f5f'
    }
  };
  
  const cardElement = elements.create('card', { style });
  cardElement.mount(`#${containerId}`);
  
  return cardElement;
}

// Save payment method for future use
async function savePaymentMethod(paymentMethodId, customerId) {
  const response = await fetch('/api/payments/save-method', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_method_id: paymentMethodId,
      customer_id: customerId
    })
  });
  
  return response.json();
}

// Get saved payment methods
async function getSavedPaymentMethods(customerId) {
  const response = await fetch(`/api/payments/methods?customer_id=${customerId}`);
  return response.json();
}

/**
 * Webhook Event Types (for reference)
 * 
 * Your backend should handle these Stripe webhook events:
 * 
 * - payment_intent.succeeded - Payment authorized successfully
 * - payment_intent.payment_failed - Payment failed
 * - payment_intent.canceled - Payment canceled
 * - payment_intent.amount_capturable_updated - Ready to capture
 * - charge.captured - Payment captured successfully
 * - charge.refunded - Refund processed
 * - account.updated - Connect account status changed
 * - transfer.created - Transfer to provider initiated
 * - transfer.paid - Transfer to provider completed
 * - payout.paid - Payout to provider's bank completed
 */

/**
 * Mock functions for development (when Stripe is not configured)
 */

function mockCreatePayment(packageId, amount) {
  console.log('[MOCK] Creating payment:', { packageId, amount });
  return {
    success: true,
    payment_intent_id: 'pi_mock_' + Math.random().toString(36).substr(2, 9),
    client_secret: 'cs_mock_' + Math.random().toString(36).substr(2, 9),
    status: 'requires_capture'
  };
}

function mockCapturePayment(paymentIntentId) {
  console.log('[MOCK] Capturing payment:', paymentIntentId);
  return {
    success: true,
    status: 'succeeded'
  };
}

function mockCancelPayment(paymentIntentId) {
  console.log('[MOCK] Canceling payment:', paymentIntentId);
  return {
    success: true,
    status: 'canceled'
  };
}

// Export for use in other files
window.StripeUtils = {
  initStripe,
  calculateFees,
  createEscrowPayment,
  confirmPayment,
  capturePayment,
  cancelPayment,
  createConnectAccount,
  getConnectOnboardingLink,
  transferToProvider,
  createCardElement,
  savePaymentMethod,
  getSavedPaymentMethods,
  MCC_FEE_PERCENT,
  // Bid pack purchases
  createBidPackCheckout,
  // Mock functions for development
  mock: {
    createPayment: mockCreatePayment,
    capturePayment: mockCapturePayment,
    cancelPayment: mockCancelPayment
  }
};

/**
 * Create Stripe Checkout session for bid pack purchase
 * 
 * In production, this calls your backend to create a Checkout Session
 * The backend should:
 * 1. Create a Stripe Checkout Session
 * 2. Set success_url and cancel_url
 * 3. Include metadata: { provider_id, pack_id, bids, bonus_bids }
 * 4. Return the session URL
 * 
 * On successful payment, a webhook should:
 * 1. Verify the payment
 * 2. Add credits to provider's profile
 * 3. Record the purchase in bid_credit_purchases
 */
async function createBidPackCheckout(packId, packName, price, bids, bonusBids, providerId) {
  // In production, call your backend API
  // const response = await fetch('/api/create-bid-checkout', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ packId, providerId })
  // });
  // const { url } = await response.json();
  // window.location.href = url;

  // For development/demo - simulate purchase
  console.log('[Stripe] Would create checkout for:', { packId, packName, price, bids, bonusBids, providerId });
  
  return {
    // In production, return the Stripe Checkout URL
    // url: 'https://checkout.stripe.com/...',
    demo: true,
    message: 'Demo mode - credits added directly'
  };
}

/**
 * Stripe Webhook Handler (Server-side reference)
 * 
 * // Node.js/Express example:
 * app.post('/webhook/stripe', async (req, res) => {
 *   const sig = req.headers['stripe-signature'];
 *   const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
 *   
 *   if (event.type === 'checkout.session.completed') {
 *     const session = event.data.object;
 *     const { provider_id, pack_id, bids, bonus_bids } = session.metadata;
 *     
 *     // Add credits to provider
 *     await supabase.from('profiles')
 *       .update({ 
 *         bid_credits: supabase.raw('bid_credits + ?', [parseInt(bids) + parseInt(bonus_bids)]),
 *         total_bids_purchased: supabase.raw('total_bids_purchased + ?', [parseInt(bids) + parseInt(bonus_bids)])
 *       })
 *       .eq('id', provider_id);
 *     
 *     // Record purchase
 *     await supabase.from('bid_credit_purchases').insert({
 *       provider_id,
 *       pack_id,
 *       bids_purchased: parseInt(bids),
 *       bonus_bids: parseInt(bonus_bids),
 *       amount_paid: session.amount_total / 100,
 *       stripe_payment_id: session.payment_intent,
 *       status: 'completed'
 *     });
 *   }
 *   
 *   res.json({ received: true });
 * });
 */
