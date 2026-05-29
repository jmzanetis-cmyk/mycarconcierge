'use strict';

// isFeatureEnabledForUser(supabase, flagKey, userId) → boolean
//
// A flag is ON for a user if:
//   platform_settings.setting_value.enabled === true  (global)
//   OR userId is in setting_value.test_users[] (per-user override)
//
// Returns false on any DB error so callers fail closed.
async function isFeatureEnabledForUser(supabase, flagKey, userId) {
  var result = await supabase
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', flagKey)
    .single();

  if (result.error || !result.data) return false;

  var val = result.data.setting_value;
  if (!val || typeof val !== 'object') return false;

  if (val.enabled === true) return true;

  var testUsers = Array.isArray(val.test_users) ? val.test_users : [];
  return testUsers.includes(userId);
}

module.exports = { isFeatureEnabledForUser };
