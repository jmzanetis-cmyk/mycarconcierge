const Stripe = require('stripe');

let stripe = null;

function getStripeClient() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return stripe;
}

async function checkTreasuryAvailability() {
  try {
    const stripeClient = getStripeClient();
    
    if (!stripeClient) {
      console.log('[TREASURY] Stripe API key not configured');
      return {
        success: false,
        treasuryActive: false,
        error: 'Stripe API key not configured',
        message: 'Treasury module cannot initialize without STRIPE_SECRET_KEY'
      };
    }

    const account = await stripeClient.accounts.retrieve();
    
    const treasuryCapability = account.capabilities?.treasury;
    const treasuryActive = treasuryCapability?.status === 'active';
    
    console.log(`[TREASURY] Availability check - Treasury capability status: ${treasuryCapability?.status || 'not_found'}`);
    
    return {
      success: true,
      treasuryActive: treasuryActive,
      capabilityStatus: treasuryCapability?.status || 'not_found',
      message: treasuryActive ? 'Treasury is active on this account' : 'Treasury capability not available on this account',
      fallbackToDb: !treasuryActive
    };
  } catch (error) {
    console.error('[TREASURY] Error checking availability:', error.message);
    return {
      success: false,
      treasuryActive: false,
      error: error.code || 'availability_check_failed',
      message: error.message,
      fallbackToDb: true
    };
  }
}

async function getOrCreateFinancialAccount(accountName = 'Bonus Reserve Account') {
  try {
    const stripeClient = getStripeClient();
    
    if (!stripeClient) {
      console.log('[TREASURY] Stripe API key not configured');
      return {
        success: false,
        treasuryActive: false,
        error: 'Stripe API key not configured',
        fallbackToDb: true,
        message: 'Cannot manage Financial Accounts without STRIPE_SECRET_KEY'
      };
    }

    const availability = await checkTreasuryAvailability();
    if (!availability.treasuryActive) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Treasury not active',
        message: 'Treasury capability not available. Using database tracking for reserves.',
        fallbackToDb: true
      };
    }

    try {
      const existingAccounts = await stripeClient.treasury.financialAccounts.list({ limit: 10 });
      
      if (existingAccounts.data && existingAccounts.data.length > 0) {
        const activeAccount = existingAccounts.data.find(acc => acc.status === 'active') || existingAccounts.data[0];
        console.log('[TREASURY] Found existing Financial Account:', activeAccount.id);
        
        return {
          success: true,
          treasuryActive: true,
          financialAccountId: activeAccount.id,
          status: activeAccount.status,
          created: false,
          message: 'Retrieved existing Financial Account for bonus reserves'
        };
      }
    } catch (listError) {
      console.warn('[TREASURY] Could not list existing Financial Accounts:', listError.message);
    }

    try {
      const financialAccount = await stripeClient.treasury.financialAccounts.create({
        supported_currencies: ['usd'],
        features: {
          card_issuing: { requested: false },
          deposit_insurance: { requested: false },
          financial_addresses: { aba: { requested: true } },
          inbound_transfers: { requested: true },
          outbound_payments: { requested: true },
          outbound_transfers: { requested: true }
        }
      });
      
      console.log('[TREASURY] Created new Financial Account:', financialAccount.id);
      
      return {
        success: true,
        treasuryActive: true,
        financialAccountId: financialAccount.id,
        status: financialAccount.status,
        created: true,
        message: 'Successfully created Financial Account for bonus reserves'
      };
    } catch (createError) {
      console.error('[TREASURY] Error creating Financial Account:', createError.message);
      
      if (createError.code === 'resource_already_exists') {
        return {
          success: false,
          treasuryActive: true,
          error: 'Financial Account already exists',
          message: 'A Financial Account already exists. Please retrieve it instead.',
          fallbackToDb: false
        };
      }
      
      return {
        success: false,
        treasuryActive: true,
        error: createError.code || 'account_creation_failed',
        message: createError.message,
        fallbackToDb: false
      };
    }
  } catch (error) {
    console.error('[TREASURY] Unexpected error with Financial Account:', error.message);
    return {
      success: false,
      treasuryActive: false,
      error: error.code || 'unexpected_error',
      message: error.message,
      fallbackToDb: true
    };
  }
}

async function transferToTreasury(financialAccountId, amountCents, description = 'Reserve accrual (15%)') {
  try {
    if (!financialAccountId) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Missing financial account ID',
        message: 'Financial account ID is required for Treasury transfers',
        fallbackToDb: true
      };
    }

    if (!amountCents || amountCents <= 0) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Invalid amount',
        message: 'Transfer amount must be greater than 0',
        fallbackToDb: false
      };
    }

    const stripeClient = getStripeClient();
    
    if (!stripeClient) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Stripe API key not configured',
        fallbackToDb: true
      };
    }

    const availability = await checkTreasuryAvailability();
    if (!availability.treasuryActive) {
      console.log('[TREASURY] Treasury not active - falling back to database tracking for amount:', amountCents / 100);
      return {
        success: false,
        treasuryActive: false,
        error: 'Treasury not active',
        amount: amountCents / 100,
        message: 'Treasury capability not available. Using database tracking for reserve accrual.',
        fallbackToDb: true
      };
    }

    try {
      const inboundTransfer = await stripeClient.treasury.inboundTransfers.create({
        financial_account: financialAccountId,
        amount: amountCents,
        currency: 'usd',
        description: description,
        origin_payment_method_data: {
          type: 'balance'
        }
      });

      console.log('[TREASURY] Inbound transfer created:', inboundTransfer.id, 'Amount:', amountCents / 100, 'USD');

      return {
        success: true,
        treasuryActive: true,
        transferId: inboundTransfer.id,
        status: inboundTransfer.status,
        amount: amountCents / 100,
        amountCents: amountCents,
        currency: 'usd',
        description: description,
        message: 'Transfer to Treasury initiated successfully'
      };
    } catch (error) {
      console.error('[TREASURY] Error creating inbound transfer:', error.message);
      
      return {
        success: false,
        treasuryActive: true,
        error: error.code || 'transfer_failed',
        amount: amountCents / 100,
        message: error.message,
        fallbackToDb: false
      };
    }
  } catch (error) {
    console.error('[TREASURY] Unexpected error transferring to Treasury:', error.message);
    return {
      success: false,
      treasuryActive: false,
      error: error.code || 'unexpected_error',
      message: error.message,
      fallbackToDb: true
    };
  }
}

async function transferFromTreasury(financialAccountId, amountCents, destinationPaymentMethod, description = 'Milestone payout') {
  try {
    if (!financialAccountId) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Missing financial account ID',
        message: 'Financial account ID is required for Treasury transfers',
        fallbackToDb: true
      };
    }

    if (!amountCents || amountCents <= 0) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Invalid amount',
        message: 'Transfer amount must be greater than 0',
        fallbackToDb: false
      };
    }

    if (!destinationPaymentMethod) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Missing destination payment method',
        message: 'Destination payment method is required for outbound transfers',
        fallbackToDb: false
      };
    }

    const stripeClient = getStripeClient();
    
    if (!stripeClient) {
      return {
        success: false,
        treasuryActive: false,
        error: 'Stripe API key not configured',
        fallbackToDb: true
      };
    }

    const availability = await checkTreasuryAvailability();
    if (!availability.treasuryActive) {
      console.log('[TREASURY] Treasury not active - falling back to database tracking for payout:', amountCents / 100);
      return {
        success: false,
        treasuryActive: false,
        error: 'Treasury not active',
        amount: amountCents / 100,
        message: 'Treasury capability not available. Using database tracking for milestone payouts.',
        fallbackToDb: true
      };
    }

    try {
      const outboundTransfer = await stripeClient.treasury.outboundTransfers.create({
        financial_account: financialAccountId,
        destination_payment_method: destinationPaymentMethod,
        amount: amountCents,
        currency: 'usd',
        description: description
      });

      console.log('[TREASURY] Outbound transfer created:', outboundTransfer.id, 'Amount:', amountCents / 100, 'USD');

      return {
        success: true,
        treasuryActive: true,
        transferId: outboundTransfer.id,
        status: outboundTransfer.status,
        amount: amountCents / 100,
        amountCents: amountCents,
        currency: 'usd',
        description: description,
        message: 'Transfer from Treasury initiated successfully'
      };
    } catch (error) {
      console.error('[TREASURY] Error creating outbound transfer:', error.message);
      
      return {
        success: false,
        treasuryActive: true,
        error: error.code || 'transfer_failed',
        amount: amountCents / 100,
        message: error.message,
        fallbackToDb: false
      };
    }
  } catch (error) {
    console.error('[TREASURY] Unexpected error transferring from Treasury:', error.message);
    return {
      success: false,
      treasuryActive: false,
      error: error.code || 'unexpected_error',
      message: error.message,
      fallbackToDb: true
    };
  }
}

async function getTreasuryBalance(financialAccountId) {
  try {
    if (!financialAccountId) {
      return {
        success: false,
        treasuryActive: false,
        balance: 0,
        balanceCents: 0,
        error: 'Missing financial account ID',
        message: 'Financial account ID is required to retrieve balance'
      };
    }

    const stripeClient = getStripeClient();
    
    if (!stripeClient) {
      return {
        success: false,
        treasuryActive: false,
        balance: 0,
        balanceCents: 0,
        error: 'Stripe API key not configured',
        message: 'Cannot retrieve Treasury balance without STRIPE_SECRET_KEY'
      };
    }

    const availability = await checkTreasuryAvailability();
    if (!availability.treasuryActive) {
      return {
        success: false,
        treasuryActive: false,
        balance: 0,
        balanceCents: 0,
        error: 'Treasury not active',
        message: 'Treasury capability not available. Using database tracking for reserves.',
        fallbackToDb: true
      };
    }

    try {
      const financialAccount = await stripeClient.treasury.financialAccounts.retrieve(financialAccountId);
      
      if (!financialAccount) {
        return {
          success: false,
          treasuryActive: true,
          balance: 0,
          balanceCents: 0,
          error: 'Financial account not found',
          message: 'The specified Financial Account could not be retrieved'
        };
      }

      const balances = await stripeClient.treasury.financialAccountBalances.list(financialAccountId);
      
      const usdBalance = balances.data?.find(b => b.currency === 'usd');
      const balanceCents = usdBalance ? usdBalance.amount : 0;
      const balanceDollars = balanceCents / 100;

      console.log('[TREASURY] Balance retrieved for account', financialAccountId, ':', balanceDollars, 'USD');

      return {
        success: true,
        treasuryActive: true,
        financialAccountId: financialAccountId,
        balance: balanceDollars,
        balanceCents: balanceCents,
        currency: 'usd',
        accountStatus: financialAccount.status,
        message: 'Treasury balance retrieved successfully'
      };
    } catch (error) {
      console.error('[TREASURY] Error retrieving balance:', error.message);
      
      return {
        success: false,
        treasuryActive: true,
        balance: 0,
        balanceCents: 0,
        error: error.code || 'balance_retrieval_failed',
        message: error.message,
        fallbackToDb: false
      };
    }
  } catch (error) {
    console.error('[TREASURY] Unexpected error retrieving Treasury balance:', error.message);
    return {
      success: false,
      treasuryActive: false,
      balance: 0,
      balanceCents: 0,
      error: error.code || 'unexpected_error',
      message: error.message,
      fallbackToDb: true
    };
  }
}

// Cached financial account ID to avoid repeated lookups
let cachedFinancialAccountId = null;

async function getCachedFinancialAccountId() {
  if (cachedFinancialAccountId) {
    return cachedFinancialAccountId;
  }
  
  const accountResult = await getOrCreateFinancialAccount();
  if (accountResult.success && accountResult.financialAccountId) {
    cachedFinancialAccountId = accountResult.financialAccountId;
    return cachedFinancialAccountId;
  }
  
  return null;
}

// Simple wrapper that handles account ID lookup and dollar-to-cents conversion
async function transferToTreasurySimple(amountDollars, description = 'Reserve accrual (15%)') {
  try {
    const financialAccountId = await getCachedFinancialAccountId();
    
    if (!financialAccountId) {
      console.log('[TREASURY] No financial account available - falling back to DB tracking');
      return {
        success: false,
        treasuryActive: false,
        fallbackToDb: true,
        message: 'Treasury not available or not set up'
      };
    }
    
    const amountCents = Math.round(amountDollars * 100);
    const result = await transferToTreasury(financialAccountId, amountCents, description);
    
    // Map transferId to transactionId for consistency with server.js expectations
    if (result.transferId) {
      result.transactionId = result.transferId;
    }
    
    return result;
  } catch (error) {
    console.error('[TREASURY] Error in transferToTreasurySimple:', error.message);
    return {
      success: false,
      treasuryActive: false,
      fallbackToDb: true,
      message: error.message
    };
  }
}

// Simple wrapper for outbound transfers (milestone payouts)
// Note: Since Treasury outbound requires a destination payment method,
// and milestone payouts are typically done manually via Stripe dashboard,
// this returns a fallback indicator for now
async function transferFromTreasurySimple(amountDollars, description = 'Milestone payout') {
  try {
    const financialAccountId = await getCachedFinancialAccountId();
    
    if (!financialAccountId) {
      console.log('[TREASURY] No financial account available - falling back to manual payout');
      return {
        success: false,
        treasuryActive: false,
        fallbackToDb: true,
        message: 'Treasury not available. Manual payout required.'
      };
    }
    
    // For milestone payouts, we indicate that funds should be transferred from Treasury
    // but the actual payout to Chris would need to be done via Stripe dashboard or
    // with a specific destination payment method
    console.log(`[TREASURY] Milestone payout of $${amountDollars} should be transferred from Treasury account ${financialAccountId}`);
    
    return {
      success: true,
      treasuryActive: true,
      financialAccountId: financialAccountId,
      amount: amountDollars,
      message: `Funds available in Treasury. Please process $${amountDollars} payout via Stripe dashboard.`,
      requiresManualPayout: true
    };
  } catch (error) {
    console.error('[TREASURY] Error in transferFromTreasurySimple:', error.message);
    return {
      success: false,
      treasuryActive: false,
      fallbackToDb: true,
      message: error.message
    };
  }
}

// Simple wrapper for getting Treasury balance
async function getTreasuryBalanceSimple() {
  try {
    const financialAccountId = await getCachedFinancialAccountId();
    
    if (!financialAccountId) {
      return {
        success: false,
        treasuryActive: false,
        balance: 0,
        fallbackToDb: true,
        message: 'Treasury not available'
      };
    }
    
    return await getTreasuryBalance(financialAccountId);
  } catch (error) {
    console.error('[TREASURY] Error in getTreasuryBalanceSimple:', error.message);
    return {
      success: false,
      treasuryActive: false,
      balance: 0,
      fallbackToDb: true,
      message: error.message
    };
  }
}

module.exports = {
  checkTreasuryAvailability,
  getOrCreateFinancialAccount,
  // Original functions (require financialAccountId and amountCents)
  transferToTreasury: transferToTreasurySimple,
  transferFromTreasury: transferFromTreasurySimple,
  getTreasuryBalance: getTreasuryBalanceSimple,
  // Low-level functions for advanced use
  _transferToTreasuryRaw: transferToTreasury,
  _transferFromTreasuryRaw: transferFromTreasury,
  _getTreasuryBalanceRaw: getTreasuryBalance
};
