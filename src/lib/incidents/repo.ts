// Server-only data access for incidents, call events, and transcripts.
// Uses the admin client, so EVERY caller must run an authorization check
// (src/lib/incidents/access.ts) before calling a write here.
// All functions throw on database errors; callers decide what is fatal.
import { createAdminClient } from "@/lib/supabase/server";
import type { IncidentStatus, LatLng } from "@/lib/types";
import type { CallEventType } from "@/lib/agora/channel";

export interface IncidentRecord {
  id: string;
  status: IncidentStatus;
  reporter_id: string | null;
  assigned_bhw: string | null;
  patient_id: string | null;
  note: string | null;
  created_at: string;
}

export interface TranscriptRow {
  incident_id: string;
  speaker: string;
  text: string;
  source_key: string;
}

export type IncidentEventType = CallEventType | "sos_created";

const INCIDENT_COLUMNS =
  "id,status,reporter_id,assigned_bhw,patient_id,note,created_at";

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
