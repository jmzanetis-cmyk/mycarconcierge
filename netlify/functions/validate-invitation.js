var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var token = utils.extractPathParam(event.path);

    if (!token || token.length !== 64) {
      return utils.errorResponse(400, 'Invalid invitation token');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var result = await supabase
      .from('provider_invitations')
      .select('id, email, role, provider_id, expires_at')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Invitation not found or has expired');
    }

    var invitation = result.data;

    var providerName = '';
    if (invitation.provider_id) {
      var profileResult = await supabase
        .from('profiles')
        .select('full_name, business_name')
        .eq('id', invitation.provider_id)
        .single();

      if (profileResult.data) {
        providerName = profileResult.data.business_name || profileResult.data.full_name || '';
      }
    }

    var maskedEmail = '';
    if (invitation.email) {
      var parts = invitation.email.split('@');
      if (parts.length === 2) {
        var localPart = parts[0];
        var domain = parts[1];
        maskedEmail = localPart.substring(0, 2) + '***@' + domain;
      } else {
        maskedEmail = '***';
      }
    }

    return utils.successResponse({
      valid: true,
      email: maskedEmail,
      role: invitation.role,
      provider_name: providerName,
      expires_at: invitation.expires_at
    });
  } catch (err) {
    console.error('validate-invitation error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
