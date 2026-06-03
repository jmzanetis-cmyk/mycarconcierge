// ============================================================================
// MCC custody chain — TypeScript types (mirror of custody_chain_schema.sql)
// Shared by mycarconcierge (member) and mcc_driver. Keep in sync with the DB.
// ============================================================================

export type PartyRole = 'member' | 'provider' | 'driver';

export type HandoffLeg =
  | 'member_to_driver'   // 1. pickup
  | 'driver_to_shop'     // 2. drop-off
  | 'shop_to_driver'     // 3. return after service
  | 'driver_to_member'   // 4. delivery
  | 'driver_to_driver';  // relay

export type HandoffStatus =
  | 'pending'
  | 'awaiting_receiver'
  | 'accepted'
  | 'disputed';

export type AttestationType = 'release' | 'accept' | 'dispute';

export type PhotoAngle =
  | 'front' | 'rear' | 'driver_side' | 'passenger_side' | 'roof'
  | 'wheel_fl' | 'wheel_fr' | 'wheel_rl' | 'wheel_rr'
  | 'interior_front' | 'interior_rear' | 'cargo' | 'odometer' | 'other';

export type DisputeType =
  | 'new_damage'
  | 'missing_item'
  | 'condition_mismatch'
  | 'cleaning_revealed';

export type DisputeStatus =
  | 'open' | 'under_review'
  | 'resolved_charged' | 'resolved_no_fault' | 'resolved_cleaning_exception';

export type FeeStatus = 'pending' | 'authorized' | 'paid' | 'waived' | 'refunded';

// The guided angle set, in capture order, by handoff face. Drive your camera UI
// off this so every checkpoint is comparable.
export const EXTERIOR_ANGLES: PhotoAngle[] = [
  'front', 'rear', 'driver_side', 'passenger_side', 'roof',
  'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
];
export const INTERIOR_ANGLES: PhotoAngle[] = ['interior_front', 'interior_rear', 'cargo', 'odometer'];
export const FULL_ANGLE_SET: PhotoAngle[] = [...EXTERIOR_ANGLES, ...INTERIOR_ANGLES];

// ---- Row types -------------------------------------------------------------

export interface CustodyHandoff {
  id: string;
  job_id: string;
  sequence: number;
  leg: HandoffLeg;
  releasing_party_id: string;
  releasing_party_role: PartyRole;
  receiving_party_id: string;
  receiving_party_role: PartyRole;
  status: HandoffStatus;
  handoff_lat: number | null;
  handoff_lng: number | null;
  handoff_gps_accuracy_m: number | null;
  released_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface CustodyPhoto {
  id: string;
  handoff_id: string;
  job_id: string;
  captured_by: string;
  captured_by_role: PartyRole;
  angle: PhotoAngle;
  storage_path: string;
  captured_at: string;
  server_received_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  live_capture: boolean;
  quality_score: number | null;
  quality_flags: string[];
  ai_diff_result: unknown | null;
  created_at: string;
}

export interface CustodyAttestation {
  id: string;
  handoff_id: string;
  job_id: string;
  party_id: string;
  party_role: PartyRole;
  type: AttestationType;
  condition_ok: boolean;
  notes: string | null;
  attested_at: string;
  created_at: string;
}

export interface CustodyDispute {
  id: string;
  job_id: string;
  handoff_id: string;
  raised_by: string;
  raised_by_role: PartyRole;
  type: DisputeType;
  description: string | null;
  implicated_party_id: string | null;
  implicated_role: PartyRole | null;
  status: DisputeStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ReturnFee {
  id: string;
  job_id: string;
  item_owner_id: string;
  item_owner_role: PartyRole;
  driver_id: string;
  description: string | null;
  discovered_in_handoff_id: string | null;
  fee_amount_cents: number;
  status: FeeStatus;
  stripe_payment_intent_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

// A fully hydrated chain for one job — what the dispute / review UI reads.
export interface JobCustodyChain {
  handoffs: CustodyHandoff[];
  photos: CustodyPhoto[];
  attestations: CustodyAttestation[];
  disputes: CustodyDispute[];
}

export const CUSTODY_BUCKET = 'custody-evidence';
