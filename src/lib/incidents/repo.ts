// Server-only data access for incidents, call events, and transcripts.
// Uses the admin client, so EVERY caller must run an authorization check
// (src/lib/incidents/access.ts) before calling a write here.
// All functions throw on database errors; callers decide what is fatal.
import { createAdminClient } from "@/lib/supabase/server";
import { parseEwkbPoint } from "@/lib/geo/ewkb";
import type { IncidentStatus, LatLng } from "@/lib/types";
import type { IncidentTriage } from "@/lib/incidents/triage";
import type { CallEventType } from "@/lib/agora/channel";

export interface IncidentRecord {
  id: string;
  status: IncidentStatus;
  reporter_id: string | null;
  assigned_bhw: string | null;
  assigned_hospital: string | null;
  patient_id: string | null;
  note: string | null;
  triage: Record<string, unknown>;
  missing_fields: string[];
  unstable: boolean;
  created_at: string;
  updated_at: string;
}

export interface TranscriptRow {
  incident_id: string;
  speaker: string;
  text: string;
  source_key: string;
}

export type IncidentEventType =
  | CallEventType
  | "sos_created"
  | "incident_closed"
  | "triage_updated"
  | "status_changed"
  | "hospital_assigned";

const INCIDENT_COLUMNS =
  "id,status,reporter_id,assigned_bhw,assigned_hospital,patient_id,note,triage,missing_fields,unstable,created_at,updated_at";

// The hand-written Database type doesn't satisfy supabase-js 2.117's write
// inference, so write payloads type-check as `never`. Regenerate types with
// `npx supabase gen types typescript` and delete this helper.
function payload<T extends Record<string, unknown>>(obj: T) {
  return obj as unknown as never;
}

export async function getIncident(id: string): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .select(INCIDENT_COLUMNS)
    .eq("id", id)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

// Most recent open incident this reporter raised, so repeated SOS taps reuse
// one incident instead of flooding the BHW queue.
export async function findOpenIncidentForReporter(
  reporterId: string,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .select(INCIDENT_COLUMNS)
    .eq("reporter_id", reporterId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

// Demo stand-in for enrollment: the registered SOS path links the seeded demo
// patient until real BHW enrollment exists.
export async function findDemoPatientId(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("patients")
    .select("id")
    .eq("name", "Rosa D. (demo)")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return data?.id ?? null;
}

export async function createIncident(input: {
  reporterId: string;
  patientId: string | null;
  note: string | null;
  location: LatLng | null;
}): Promise<IncidentRecord> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .insert(
      payload({
        reporter_id: input.reporterId,
        patient_id: input.patientId,
        note: input.note,
        status: "sos",
        // PostGIS takes (lng lat) order.
        location: input.location
          ? `SRID=4326;POINT(${input.location.lng} ${input.location.lat})`
          : null,
      }),
    )
    .select(INCIDENT_COLUMNS)
    .single<IncidentRecord>();
  if (error) throw error;
  return data;
}

// A repeat SOS on an open incident refreshes what the caller just sent: a
// newer GPS fix and/or a note. Fields left undefined are not touched.
export async function updateIncidentDetails(
  incidentId: string,
  details: { location?: LatLng; note?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (details.location) {
    patch.location = `SRID=4326;POINT(${details.location.lng} ${details.location.lat})`;
  }
  if (details.note) patch.note = details.note;
  if (Object.keys(patch).length === 0) return;
  patch.updated_at = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("incidents")
    .update(payload(patch))
    .eq("id", incidentId)
    .neq("status", "closed");
  if (error) throw error;
}

// Atomically assigns the BHW only if nobody else has the incident yet.
// Returns null when another BHW won the race.
export async function claimIncident(
  incidentId: string,
  bhwId: string,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .update(payload({ assigned_bhw: bhwId, updated_at: new Date().toISOString() }))
    .eq("id", incidentId)
    .neq("status", "closed")
    .or(`assigned_bhw.is.null,assigned_bhw.eq.${bhwId}`)
    .select(INCIDENT_COLUMNS)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

export async function updateIncidentTriage(
  incidentId: string,
  triage: IncidentTriage,
  missingFields: string[],
  unstable: boolean,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .update(
      payload({
        triage,
        missing_fields: missingFields,
        unstable,
        updated_at: new Date().toISOString(),
      }),
    )
    .eq("id", incidentId)
    .neq("status", "closed")
    .select(INCIDENT_COLUMNS)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

// Compare-and-set prevents two devices from advancing the same stale status.
export async function transitionIncidentStatus(
  incidentId: string,
  expectedStatus: IncidentStatus,
  nextStatus: IncidentStatus,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .update(payload({ status: nextStatus, updated_at: new Date().toISOString() }))
    .eq("id", incidentId)
    .eq("status", expectedStatus)
    .select(INCIDENT_COLUMNS)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

export interface HospitalRecord {
  id: string;
  name: string;
  is_diverting: boolean;
}

export async function getHospital(id: string): Promise<HospitalRecord | null> {
  const { data, error } = await createAdminClient()
    .from("hospitals")
    .select("id,name,is_diverting")
    .eq("id", id)
    .maybeSingle<HospitalRecord>();
  if (error) throw error;
  return data;
}

// The assigned BHW records the ambulance crew's explicit destination choice.
export async function assignIncidentHospital(
  incidentId: string,
  bhwId: string,
  hospitalId: string,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .update(
      payload({ assigned_hospital: hospitalId, updated_at: new Date().toISOString() }),
    )
    .eq("id", incidentId)
    .eq("assigned_bhw", bhwId)
    .eq("status", "transporting")
    .select(INCIDENT_COLUMNS)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

// Closes an incident assigned to this BHW. Returns null if it is not theirs
// or is already closed.
export async function closeIncident(
  incidentId: string,
  bhwId: string,
): Promise<IncidentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .update(payload({ status: "closed", updated_at: new Date().toISOString() }))
    .eq("id", incidentId)
    .eq("assigned_bhw", bhwId)
    .neq("status", "closed")
    .select(INCIDENT_COLUMNS)
    .maybeSingle<IncidentRecord>();
  if (error) throw error;
  return data;
}

export async function logEvent(
  incidentId: string,
  actorId: string | null,
  type: IncidentEventType,
  eventPayload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await createAdminClient()
    .from("incident_events")
    .insert(
      payload({ incident_id: incidentId, actor_id: actorId, type, payload: eventPayload }),
    );
  if (error) throw error;
}

// Best-effort variant: event logging must never break a call or dispatch.
export async function logEventSafe(
  ...args: Parameters<typeof logEvent>
): Promise<boolean> {
  try {
    await logEvent(...args);
    return true;
  } catch (error) {
    console.error("[incident_events] write failed:", (error as Error).message);
    return false;
  }
}

// Inserts transcript rows, skipping any whose source_key already exists.
// Returns how many new rows were written.
export async function insertTranscriptSegments(
  rows: TranscriptRow[],
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("transcript_segments")
    .upsert(rows as unknown as never, {
      onConflict: "source_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

// The SOS GPS fix, or null if the caller's phone didn't share one.
export async function getIncidentLocation(incidentId: string): Promise<LatLng | null> {
  const { data, error } = await createAdminClient()
    .from("incidents")
    .select("location")
    .eq("id", incidentId)
    .maybeSingle<{ location: string | null }>();
  if (error) throw error;
  return parseEwkbPoint(data?.location ?? null);
}

export interface PatientSummary {
  name: string;
  age: number | null;
  sex: "F" | "M" | null;
  conditions: string[];
  meds: string[];
  allergies: string[];
  address: string | null;
  landmark: string | null;
}

// Enrolled patient details for the BHW who accepted the incident.
// null for unregistered callers.
export async function getPatientSummary(
  patientId: string | null,
): Promise<PatientSummary | null> {
  if (!patientId) return null;
  const { data, error } = await createAdminClient()
    .from("patients")
    .select("name,age,sex,conditions,meds,allergies,address,landmark")
    .eq("id", patientId)
    .maybeSingle<PatientSummary>();
  if (error) throw error;
  return data;
}
