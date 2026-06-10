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

    // 1. Check provider_referral_codes (founding provider / admin-issued codes)
    var result = await supabase
      .from('provider_referral_codes')
      .select('id, code, code_type, provider_id, skip_identity_verification, platform_fee_exempt, is_active')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (!result.error && result.data) {
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
        var foundingCodes = { 'CHRIS': 'Chris Agrapidis' };
        providerName = foundingCodes[upperCode] || 'Founding Provider Partner';
      }

      return utils.successResponse({
        success: true,
        referrer_type: 'provider_code',
        code_type: referralCode.code_type,
        provider_id: referralCode.provider_id,
        provider_name: providerName,
        skip_identity_verification: referralCode.skip_identity_verification || false,
        platform_fee_exempt: referralCode.platform_fee_exempt || false,
        is_founding_provider: !referralCode.provider_id && !!providerName
      });
    }

    // 2. Check member_founder_profiles.referral_code (provider self-generated codes)
    var founderResult = await supabase
      .from('member_founder_profiles')
      .select('id, referral_code, full_name, email, user_id')
      .eq('referral_code', upperCode)
      .eq('status', 'active')
      .maybeSingle();

    if (founderResult.data) {
      var fp = founderResult.data;
      return utils.successResponse({
        success: true,
        referrer_type: 'founder',
        code_type: 'provider',
        provider_id: fp.user_id,
        founder_id: fp.id,
        provider_name: fp.full_name || fp.email || 'Member Founder',
        skip_identity_verification: false,
        platform_fee_exempt: false,
        is_founding_provider: false
      });
    }

    // 3. Check profiles.member_referral_code (member-generated codes, e.g. MCC + hex)
    var memberResult = await supabase
      .from('profiles')
      .select('id, full_name, email, member_referral_code')
      .eq('member_referral_code', upperCode)
      .maybeSingle();

    if (memberResult.data) {
      var mp = memberResult.data;
      return utils.successResponse({
        success: true,
        referrer_type: 'member',
        code_type: 'member_referral',
        provider_id: null,
        member_id: mp.id,
        provider_name: mp.full_name || mp.email || 'Member',
        skip_identity_verification: false,
        platform_fee_exempt: false,
        is_founding_provider: false
      });
    }

    return utils.errorResponse(404, 'Referral code not found');
  } catch (err) {
    console.error('referral-lookup error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
