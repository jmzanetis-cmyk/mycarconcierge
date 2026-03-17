var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var code = utils.extractPathParam(event.path);

    if (!code) {
      return utils.errorResponse(400, 'Missing referral code');
    }

    var upperCode = code.toUpperCase();

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var result = await supabase
      .from('provider_referral_codes')
      .select('id, code, code_type, provider_id, skip_identity_verification, platform_fee_exempt, is_active')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (result.error || !result.data) {
      var codeType = 'unknown';
      var prefix = upperCode.substring(0, 2);
      if (prefix === 'LC') codeType = 'loyal_customer';
      else if (prefix === 'NM') codeType = 'new_member';
      else if (prefix === 'PR') codeType = 'provider';

      return utils.errorResponse(404, 'Referral code not found. Code type detected: ' + codeType);
    }

    var referralCode = result.data;
    var providerName = '';

    if (referralCode.provider_id) {
      var profileResult = await supabase
        .from('profiles')
        .select('full_name, business_name')
        .eq('id', referralCode.provider_id)
        .single();

      if (profileResult.data) {
        providerName = profileResult.data.business_name || profileResult.data.full_name || '';
      }
    }

    if (!providerName && !referralCode.provider_id) {
      var foundingCodes = {
        'CHRIS': 'Chris Agrapidis'
      };
      providerName = foundingCodes[upperCode] || 'Founding Provider Partner';
    }

    return utils.successResponse({
      success: true,
      code_type: referralCode.code_type,
      provider_id: referralCode.provider_id,
      provider_name: providerName,
      skip_identity_verification: referralCode.skip_identity_verification || false,
      platform_fee_exempt: referralCode.platform_fee_exempt || false,
      is_founding_provider: !referralCode.provider_id && !!providerName
    });
  } catch (err) {
    console.error('referral-lookup error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
