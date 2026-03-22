var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var user_id = body.user_id;
    var referral_code = body.referral_code;

    if (!user_id || !referral_code) {
      return utils.errorResponse(400, 'Missing user_id or referral_code');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var upperCode = referral_code.toUpperCase();

    var codeResult = await supabase
      .from('provider_referral_codes')
      .select('id, code, code_type, provider_id, skip_identity_verification, platform_fee_exempt, is_active, uses_count')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (codeResult.error || !codeResult.data) {
      return utils.errorResponse(404, 'Referral code not found or inactive');
    }

    var referralCodeData = codeResult.data;

    var profileUpdate = {
      provider_referral_type: referralCodeData.code_type
    };

    if (referralCodeData.provider_id) {
      profileUpdate.referred_by_provider_id = referralCodeData.provider_id;
    }

    if (referralCodeData.code_type === 'loyal_customer') {
      profileUpdate.platform_fee_exempt = referralCodeData.platform_fee_exempt || false;
      profileUpdate.provider_verified = true;
      if (referralCodeData.provider_id) {
        profileUpdate.preferred_provider_id = referralCodeData.provider_id;
      }
    }

    var updateResult = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user_id);

    if (updateResult.error) {
      console.error('Profile update error:', updateResult.error);
      return utils.errorResponse(500, 'Failed to update profile');
    }

    var insertResult = await supabase
      .from('provider_referrals')
      .insert({
        referral_code_id: referralCodeData.id,
        referred_user_id: user_id,
        provider_id: referralCodeData.provider_id,
        code_type: referralCodeData.code_type,
        created_at: new Date().toISOString()
      });

    if (insertResult.error) {
      console.error('Referral insert error:', insertResult.error);
    }

    try {
      await supabase.rpc('increment_referral_uses', { code_id: referralCodeData.id });
    } catch (rpcErr) {
      await supabase
        .from('provider_referral_codes')
        .update({ uses_count: (referralCodeData.uses_count || 0) + 1 })
        .eq('id', referralCodeData.id);
    }

    var providerName = '';
    if (referralCodeData.provider_id) {
      var profileResult = await supabase
        .from('profiles')
        .select('full_name, business_name')
        .eq('id', referralCodeData.provider_id)
        .single();

      if (profileResult.data) {
        providerName = profileResult.data.business_name || profileResult.data.full_name || '';
      }
    }

    if (!providerName && !referralCodeData.provider_id) {
      var foundingCodes = {
        'CHRIS': 'Chris Agrapidis'
      };
      providerName = foundingCodes[upperCode] || 'Founding Provider Partner';
    }

    return utils.successResponse({
      success: true,
      referral_type: referralCodeData.code_type,
      provider_name: providerName,
      platform_fee_exempt: referralCodeData.platform_fee_exempt || false
    });
  } catch (err) {
    console.error('referral-process error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
