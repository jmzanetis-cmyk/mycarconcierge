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

    // ── 1. Check provider_referral_codes (admin-issued / founding codes) ────
    var codeResult = await supabase
      .from('provider_referral_codes')
      .select('id, code, code_type, provider_id, skip_identity_verification, platform_fee_exempt, is_active, uses_count')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (!codeResult.error && codeResult.data) {
      return await _processProviderCode(supabase, user_id, upperCode, codeResult.data);
    }

    // ── 2. Check member_founder_profiles.referral_code (provider self-codes) ─
    var founderCodeRes = await supabase
      .from('member_founder_profiles')
      .select('id, referral_code, full_name, email, user_id, total_provider_referrals')
      .eq('referral_code', upperCode)
      .eq('status', 'active')
      .maybeSingle();

    if (founderCodeRes.data) {
      return await _processFounderCode(supabase, user_id, upperCode, founderCodeRes.data);
    }

    // ── 3. Check profiles.member_referral_code (member-generated codes) ──────
    var memberCodeRes = await supabase
      .from('profiles')
      .select('id, full_name, email, member_referral_code')
      .eq('member_referral_code', upperCode)
      .maybeSingle();

    if (memberCodeRes.data) {
      return await _processMemberCode(supabase, user_id, upperCode, memberCodeRes.data);
    }

    return utils.errorResponse(404, 'Referral code not found or inactive');
  } catch (err) {
    console.error('referral-process error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

async function _processProviderCode(supabase, user_id, upperCode, codeData) {
  var profileUpdate = { provider_referral_type: codeData.code_type };

  if (codeData.provider_id) {
    profileUpdate.referred_by_founder_id = codeData.provider_id;
  }

  if (codeData.code_type === 'loyal_customer') {
    profileUpdate.platform_fee_exempt = codeData.platform_fee_exempt || false;
    profileUpdate.provider_verified = true;
    if (codeData.provider_id) {
      profileUpdate.preferred_provider_id = codeData.provider_id;
    }
  }

  var updateResult = await supabase.from('profiles').update(profileUpdate).eq('id', user_id);
  if (updateResult.error) {
    console.error('Profile update error:', updateResult.error);
    return utils.errorResponse(500, 'Failed to update profile');
  }

  await supabase.from('provider_referrals').insert({
    referral_code_id: codeData.id,
    referred_user_id: user_id,
    provider_id: codeData.provider_id,
    code_type: codeData.code_type,
    created_at: new Date().toISOString()
  });

  // Record in founder_referrals if code owner is also a member founder
  if (codeData.provider_id) {
    try {
      var founderRes = await supabase
        .from('member_founder_profiles')
        .select('id, total_provider_referrals')
        .eq('user_id', codeData.provider_id)
        .eq('status', 'active')
        .maybeSingle();

      if (founderRes.data) {
        var fp = founderRes.data;
        await supabase.from('founder_referrals').insert({
          founder_id:       fp.id,
          referral_code:    upperCode,
          referred_type:    'provider',
          referred_user_id: user_id,
          status:           'pending',
          created_at:       new Date().toISOString()
        });
        await supabase.from('member_founder_profiles')
          .update({ total_provider_referrals: (fp.total_provider_referrals || 0) + 1 })
          .eq('id', fp.id);
      }
    } catch (founderErr) {
      console.warn('[referral-process] founder_referrals insert skipped:', founderErr.message);
    }
  }

  try {
    await supabase.rpc('increment_referral_uses', { code_id: codeData.id });
  } catch {
    await supabase.from('provider_referral_codes')
      .update({ uses_count: (codeData.uses_count || 0) + 1 })
      .eq('id', codeData.id);
  }

  var providerName = '';
  if (codeData.provider_id) {
    var profileResult = await supabase.from('profiles')
      .select('full_name, business_name').eq('id', codeData.provider_id).single();
    if (profileResult.data) {
      providerName = profileResult.data.business_name || profileResult.data.full_name || '';
    }
  }
  if (!providerName && !codeData.provider_id) {
    var foundingCodes = { 'CHRIS': 'Chris Agrapidis' };
    providerName = foundingCodes[upperCode] || 'Founding Provider Partner';
  }

  return utils.successResponse({
    success: true,
    referral_type: codeData.code_type,
    referrer_type: 'provider_code',
    founder_name: providerName,
    platform_fee_exempt: codeData.platform_fee_exempt || false
  });
}

async function _processFounderCode(supabase, user_id, upperCode, founder) {
  // Link the new provider to this founder as referrer
  await supabase.from('profiles').update({
    referred_by_founder_id: founder.user_id,
    provider_referral_type: 'founder'
  }).eq('id', user_id);

  try {
    await supabase.from('founder_referrals').insert({
      founder_id:       founder.id,
      referral_code:    upperCode,
      referred_type:    'provider',
      referred_user_id: user_id,
      status:           'pending',
      created_at:       new Date().toISOString()
    });
    await supabase.from('member_founder_profiles')
      .update({ total_provider_referrals: (founder.total_provider_referrals || 0) + 1 })
      .eq('id', founder.id);
  } catch (err) {
    console.warn('[referral-process] founder_referrals insert skipped:', err.message);
  }

  return utils.successResponse({
    success: true,
    referral_type: 'founder',
    referrer_type: 'founder',
    founder_name: founder.full_name || founder.email || 'Member Founder',
    platform_fee_exempt: false
  });
}

async function _processMemberCode(supabase, user_id, upperCode, member) {
  // Link new provider to the member who referred them
  await supabase.from('profiles').update({
    referred_by_member_id: member.id,
    provider_referral_type: 'member_referral'
  }).eq('id', user_id);

  // Record in founder_referrals if this member is also a founder
  try {
    var founderRes = await supabase
      .from('member_founder_profiles')
      .select('id, total_provider_referrals')
      .eq('user_id', member.id)
      .eq('status', 'active')
      .maybeSingle();

    if (founderRes.data) {
      var fp = founderRes.data;
      await supabase.from('founder_referrals').insert({
        founder_id:       fp.id,
        referral_code:    upperCode,
        referred_type:    'provider',
        referred_user_id: user_id,
        status:           'pending',
        created_at:       new Date().toISOString()
      });
      await supabase.from('member_founder_profiles')
        .update({ total_provider_referrals: (fp.total_provider_referrals || 0) + 1 })
        .eq('id', fp.id);
    }
  } catch (err) {
    console.warn('[referral-process] member founder referral skipped:', err.message);
  }

  return utils.successResponse({
    success: true,
    referral_type: 'member_referral',
    referrer_type: 'member',
    founder_name: member.full_name || member.email || 'Member',
    platform_fee_exempt: false
  });
}
