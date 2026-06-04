// ============================================================================
// MCC custody chain — thin client helper
// Flow: live-capture -> upload to shared bucket -> insert evidence row, then
// accept/dispute through the SECURITY DEFINER RPCs. Works in both repos.
//
// Peer deps (already in your Capacitor stack):
//   @supabase/supabase-js  @capacitor/camera  @capacitor/geolocation
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import {
  CUSTODY_BUCKET,
  type CustodyHandoff,
  type CustodyPhoto,
  type DisputeType,
  type JobCustodyChain,
  type PartyRole,
  type PhotoAngle,
} from './custody.types';

// ---- helpers ---------------------------------------------------------------

function newId(): string {
  // crypto.randomUUID is available in modern WebViews; fall back if needed.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export interface Gps {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
}

async function readGps(): Promise<Gps> {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy };
  } catch {
    return { lat: null, lng: null, accuracy_m: null }; // GPS denied/unavailable — still uploads
  }
}

export interface CapturedShot {
  blob: Blob;
  capturedAt: string; // ISO
  gps: Gps;
}

// LIVE CAMERA ONLY. source: Camera forbids the gallery picker — this is the
// "no borrowed/old photos" guarantee. Do not change to CameraSource.Photos.
export async function captureLiveShot(): Promise<CapturedShot> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.DataUrl,
    allowEditing: false,
    quality: 80,
    saveToGallery: false,
  });
  const blob = dataUrlToBlob(photo.dataUrl!);
  const gps = await readGps();
  return { blob, capturedAt: new Date().toISOString(), gps };
}

// ---- capture -> upload -> insert evidence ----------------------------------

export interface UploadArgs {
  supabase: SupabaseClient;
  jobId: string;
  handoffId: string;
  capturedBy: string;        // auth.uid()
  capturedByRole: PartyRole;
  angle: PhotoAngle;
  shot: CapturedShot;
}

// Path MUST be custody/{job_id}/{handoff_id}/{photo_id}.jpg — storage RLS
// parses the job_id out of position [2]. The row id == the filename so the
// file and its metadata row are 1:1.
export async function uploadCustodyPhoto(args: UploadArgs): Promise<CustodyPhoto> {
  const { supabase, jobId, handoffId, capturedBy, capturedByRole, angle, shot } = args;
  const photoId = newId();
  const path = `custody/${jobId}/${handoffId}/${photoId}.jpg`;

  const up = await supabase.storage
    .from(CUSTODY_BUCKET)
    .upload(path, shot.blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;

  const { data, error } = await supabase
    .from('custody_photos')
    .insert({
      id: photoId,
      handoff_id: handoffId,
      job_id: jobId,
      captured_by: capturedBy,
      captured_by_role: capturedByRole,
      angle,
      storage_path: path,
      captured_at: shot.capturedAt,
      gps_lat: shot.gps.lat,
      gps_lng: shot.gps.lng,
      gps_accuracy_m: shot.gps.accuracy_m,
      live_capture: true,
      // quality_score / quality_flags / ai_diff_result are filled async by your
      // edge function after upload — leave them out here.
    })
    .select()
    .single();
  if (error) throw error;
  return data as CustodyPhoto;
}

// Convenience: shoot the full guided angle set in one go.
export async function captureAngleSet(
  base: Omit<UploadArgs, 'angle' | 'shot'>,
  angles: PhotoAngle[],
): Promise<CustodyPhoto[]> {
  const out: CustodyPhoto[] = [];
  for (const angle of angles) {
    const shot = await captureLiveShot();        // one tap per angle
    out.push(await uploadCustodyPhoto({ ...base, angle, shot }));
  }
  return out;
}

// ---- attest (receiver only — enforced server-side) -------------------------

// Accept: locks this condition as the baseline for the next leg.
export async function acceptHandoff(
  supabase: SupabaseClient,
  handoffId: string,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('close_handoff_accept', {
    p_handoff_id: handoffId,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

// Dispute: records the discrepancy against the releasing party's segment.
// Returns the new dispute id.
export async function disputeHandoff(
  supabase: SupabaseClient,
  handoffId: string,
  type: DisputeType,
  description?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('close_handoff_dispute', {
    p_handoff_id: handoffId,
    p_type: type,
    p_description: description ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ---- read the chain (RLS scopes it to parties of this job) -----------------

export async function getJobChain(
  supabase: SupabaseClient,
  jobId: string,
): Promise<JobCustodyChain> {
  const [h, p, a, d] = await Promise.all([
    supabase.from('custody_handoffs').select('*').eq('job_id', jobId).order('sequence'),
    supabase.from('custody_photos').select('*').eq('job_id', jobId),
    supabase.from('custody_attestations').select('*').eq('job_id', jobId),
    supabase.from('custody_disputes').select('*').eq('job_id', jobId),
  ]);
  for (const r of [h, p, a, d]) if (r.error) throw r.error;
  return {
    handoffs: (h.data ?? []) as CustodyHandoff[],
    photos: (p.data ?? []) as CustodyPhoto[],
    attestations: a.data ?? [],
    disputes: d.data ?? [],
  };
}

// ---- realtime: push handoff/dispute changes to every party live -----------

export function subscribeToJobChain(
  supabase: SupabaseClient,
  jobId: string,
  onChange: (table: string, payload: unknown) => void,
) {
  const channel = supabase.channel(`custody:${jobId}`);
  for (const table of ['custody_handoffs', 'custody_photos', 'custody_attestations', 'custody_disputes']) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `job_id=eq.${jobId}` },
      (payload) => onChange(table, payload),
    );
  }
  channel.subscribe();
  return () => { supabase.removeChannel(channel); }; // call on unmount
}

// ---- signed URLs for viewing evidence (private bucket) ---------------------

export async function getEvidenceUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSec = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CUSTODY_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}
