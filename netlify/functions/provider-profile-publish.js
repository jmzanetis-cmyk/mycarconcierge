// POST /api/provider/profile/publish
//
// Serves toggleDirectoryOptIn() in www/providers-settings.js -- previously
// dead-called (server.js's dev route was removed and never ported).
// Toggles a provider's public-directory listing on/off and lazily assigns
// a directory_slug the first time they opt in.
//
// NOTE: profiles.directory_slug / profiles.directory_opt_in are read/written
// throughout the app (directory-providers.js, shop-book.js) but have no
// CREATE TABLE/ALTER in supabase/migrations/ -- schema drift, added directly
// in Supabase. Trusting they exist, matching every other caller.
'use strict';

var utils = require('./utils');

function slugify(businessName) {
  return String(businessName)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authHeader = event.headers['authorization'] || event.headers['Authorization'];
  var token = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : null;
  if (!token) return utils.errorResponse(401, 'Unauthorized');

  var authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) return utils.errorResponse(401, 'Unauthorized');
  var user = authRes.data.user;

  var body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }
  var optIn = body.opt_in === true;

  try {
    var profRes = await supabase
      .from('profiles')
      .select('id, role, business_name, directory_slug, directory_opt_in')
      .eq('id', user.id)
      .single();

    var profile = profRes.data;
    if (!profile || (profile.role !== 'provider' && profile.role !== 'pending_provider')) {
      return utils.errorResponse(403, 'Only providers can publish profiles');
    }

    var slug = profile.directory_slug;
    if (optIn && !slug && profile.business_name) {
      slug = slugify(profile.business_name);

      var existingRes = await supabase
        .from('profiles')
        .select('id')
        .eq('directory_slug', slug)
        .neq('id', user.id)
        .limit(1);

      if (existingRes.data && existingRes.data.length > 0) {
        slug = slug + '-' + Math.random().toString(36).substring(2, 6);
      }
    }

    var updateData = { directory_opt_in: optIn };
    if (slug && !profile.directory_slug) {
      updateData.directory_slug = slug;
    }

    var updateRes = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateRes.error) throw new Error(updateRes.error.message);

    return utils.successResponse({
      success: true,
      directory_opt_in: optIn,
      directory_slug: slug || profile.directory_slug,
      profile_url: slug ? ('/p/' + slug) : null
    });
  } catch (err) {
    console.error('[provider-profile-publish] error:', err.message);
    return utils.errorResponse(500, 'Failed to update profile');
  }
};
