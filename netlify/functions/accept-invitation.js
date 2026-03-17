var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var token = utils.extractPathParam(event.path);

    if (!token || token.length !== 64) {
      return utils.errorResponse(400, 'Invalid invitation token');
    }

    var authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    var authToken = authHeader.replace('Bearer ', '');

    if (!authToken) {
      return utils.errorResponse(401, 'Authorization required');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var userResult = await supabase.auth.getUser(authToken);
    if (userResult.error || !userResult.data || !userResult.data.user) {
      return utils.errorResponse(401, 'Invalid or expired auth token');
    }

    var user = userResult.data.user;

    var invResult = await supabase
      .from('provider_invitations')
      .select('id, email, role, provider_id, expires_at')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (invResult.error || !invResult.data) {
      return utils.errorResponse(404, 'Invitation not found or has expired');
    }

    var invitation = invResult.data;

    var rpcResult = await supabase.rpc('accept_team_invitation', {
      p_token: token,
      p_user_id: user.id
    });

    if (rpcResult.error) {
      console.error('RPC accept_team_invitation error:', rpcResult.error);
      return utils.errorResponse(500, rpcResult.error.message || 'Failed to accept invitation');
    }

    await supabase
      .from('profiles')
      .update({ team_provider_id: invitation.provider_id })
      .eq('id', user.id);

    return utils.successResponse({
      success: true,
      provider_id: invitation.provider_id,
      role: invitation.role
    });
  } catch (err) {
    console.error('accept-invitation error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};
