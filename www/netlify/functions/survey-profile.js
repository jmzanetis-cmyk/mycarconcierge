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
    var survey_response_id = body.survey_response_id;
    var first_name = body.first_name;
    var last_name = body.last_name;
    var email = body.email;
    var phone = body.phone;
    var zip = body.zip;
    var vehicle_year = body.vehicle_year;
    var vehicle_make = body.vehicle_make;
    var vehicle_model = body.vehicle_model;

    if (!first_name || !email) {
      return utils.errorResponse(400, 'first_name and email are required');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    if (survey_response_id) {
      await supabase.from('survey_responses').update({
        first_name: first_name.trim().slice(0, 100),
        last_name:  last_name ? last_name.trim().slice(0, 100) : null,
        email:      email.trim().toLowerCase().slice(0, 254),
        phone:      phone ? phone.trim().slice(0, 30) : null,
        zip:        zip   ? zip.trim().slice(0, 20) : null
      }).eq('id', survey_response_id);
    }

    var insertResult = await supabase.from('customer_profiles').insert({
      survey_response_id: survey_response_id || null,
      first_name: first_name.trim().slice(0, 100),
      last_name:  last_name ? last_name.trim().slice(0, 100) : '',
      email:      email.trim().toLowerCase().slice(0, 254),
      phone:      phone ? phone.trim().slice(0, 30) : null,
      zip:        zip   ? zip.trim().slice(0, 20) : null,
      vehicle_year:  vehicle_year  ? vehicle_year.trim().slice(0, 10) : null,
      vehicle_make:  vehicle_make  ? vehicle_make.trim().slice(0, 60) : null,
      vehicle_model: vehicle_model ? vehicle_model.trim().slice(0, 80) : null
    }).select('id').single();

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        var existing = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('email', email.trim().toLowerCase().slice(0, 254))
          .maybeSingle();
        if (existing.data) {
          return utils.successResponse({ ok: true, id: existing.data.id, duplicate: true });
        }
      }
      console.error('[Survey] customer_profiles insert error:', insertResult.error.message);
      return utils.errorResponse(500, 'Failed to save profile');
    }

    return utils.successResponse({ ok: true, id: insertResult.data ? insertResult.data.id : null });
  } catch (err) {
    console.error('[Survey] survey-profile error:', err.message);
    return utils.errorResponse(500, 'Failed to save profile');
  }
};
