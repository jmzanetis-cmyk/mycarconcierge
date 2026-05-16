// ============================================================================
// Shared concierge scenario → legs expansion (Task #369)
//
// Source of truth for the 11 canonical concierge scenarios. Used by both:
//   - netlify/functions/concierge-jobs-admin.js  (admin-created jobs)
//   - netlify/functions/concierge-jobs-public.js (member/provider-created jobs)
//
// Keep this in sync with:
//   - supabase/migrations/20260514c_driver_concierge_jobs.sql (header comment)
//   - docs/driver-app-api.md
//
// Each leg is described by:
//   { leg_type, driver_role, direction, carries_passenger,
//     carries_member_vehicle, carries_partner_vehicle }
//
// `direction` is 'pickup_to_dropoff' (member's home/origin → provider) or
// 'dropoff_to_pickup' (provider → home). The address fields on the job
// (pickup_*/dropoff_*) are the canonical "home/origin" and "provider"
// endpoints respectively.
// ============================================================================

const D_OUT  = 'pickup_to_dropoff';   // home → provider
const D_BACK = 'dropoff_to_pickup';   // provider → home

const EXPAND_SCENARIO = {
  // T1 — passenger rides
  1: [{ leg_type: 'passenger_ride', driver_role: 'primary', direction: D_OUT,  carries_passenger: true }],
  2: [{ leg_type: 'passenger_ride', driver_role: 'primary', direction: D_BACK, carries_passenger: true }],
  3: [
    { leg_type: 'passenger_ride', driver_role: 'primary', direction: D_OUT,  carries_passenger: true },
    { leg_type: 'passenger_ride', driver_role: 'primary', direction: D_BACK, carries_passenger: true }
  ],
  // T2 — solo vehicle shuttle (member's vehicle, driver finds own way back)
  4: [{ leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_OUT,  carries_member_vehicle: true }],
  5: [{ leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_BACK, carries_member_vehicle: true }],
  6: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_BACK, carries_member_vehicle: true }
  ],
  // T3 — paired shuttle (driver A in member car, driver B in chase)
  7: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_OUT,  carries_partner_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'primary',   direction: D_BACK, carries_partner_vehicle: true }
  ],
  8: [
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_OUT,  carries_partner_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_BACK, carries_partner_vehicle: true }
  ],
  // T4 — full concierge (driver A in member car, driver B drives the member)
  9: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_OUT,  carries_passenger: true, carries_partner_vehicle: true }
  ],
  10: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_BACK, carries_passenger: true, carries_partner_vehicle: true }
  ],
  11: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_OUT,  carries_passenger: true, carries_partner_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_BACK, carries_passenger: true, carries_partner_vehicle: true }
  ]
};

// Map scenario number → tier. Used to validate caller's tier matches.
const SCENARIO_TIER = { 1:1, 2:1, 3:1, 4:2, 5:2, 6:2, 7:3, 8:3, 9:4, 10:4, 11:4 };

function expandLegs(scenario, job) {
  const blueprint = EXPAND_SCENARIO[scenario];
  if (!blueprint) return null;
  return blueprint.map((leg, idx) => {
    const out = {
      sequence: idx + 1,
      leg_type: leg.leg_type,
      driver_role: leg.driver_role,
      carries_passenger:       !!leg.carries_passenger,
      carries_member_vehicle:  !!leg.carries_member_vehicle,
      carries_partner_vehicle: !!leg.carries_partner_vehicle,
      status: 'pending'
    };
    if (leg.direction === D_OUT) {
      out.from_address = job.pickup_address;  out.from_lat = job.pickup_lat;  out.from_lng = job.pickup_lng;
      out.to_address   = job.dropoff_address; out.to_lat   = job.dropoff_lat; out.to_lng   = job.dropoff_lng;
    } else {
      out.from_address = job.dropoff_address; out.from_lat = job.dropoff_lat; out.from_lng = job.dropoff_lng;
      out.to_address   = job.pickup_address;  out.to_lat   = job.pickup_lat;  out.to_lng   = job.pickup_lng;
    }
    return out;
  });
}

module.exports = { EXPAND_SCENARIO, SCENARIO_TIER, expandLegs, D_OUT, D_BACK };
