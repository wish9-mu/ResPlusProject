// Server-side data access for incidents. These functions run in Server
// Components / Route Handlers and respect RLS via the SSR client.
//
// NOTE on the `as never` casts below: the hand-written Database type in
// src/lib/supabase/database.types.ts does not perfectly match the exact shape
// supabase-js 2.117 expects for write-payload inference, so .insert()/.update()
// payloads type-check as `never`. The real fix is to generate types from your
// live schema once the project is up:
//   npx supabase login
//   npx supabase gen types typescript --project-id <ref> \
//     > src/lib/supabase/database.types.ts
// After regenerating, delete the `writePayload` helper and pass objects directly.
import { createClient } from "@/lib/supabase/server";
import type { IncidentStatus } from "@/lib/types";

// Localized escape hatch for write payloads until generated types land.
// Keeps the rest of the file honestly typed instead of using `any` everywhere.
function writePayload<T extends Record<string, unknown>>(obj: T) {
  return obj as unknown as never;
}

export async function listIncidents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .select("id, status, patient_id, unstable, missing_fields, triage, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getIncident(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// Advance an incident and append an audit event in the same logical step.
// FLOW.md: every state change is logged to incident_events.
export async function advanceIncident(
  id: string,
  status: IncidentStatus,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("incidents")
    .update(writePayload({ status, updated_at: new Date().toISOString() }))
    .eq("id", id);
  if (updateError) throw updateError;

  const { error: eventError } = await supabase
    .from("incident_events")
    .insert(writePayload({ incident_id: id, type: eventType, payload }));
  if (eventError) throw eventError;
}

export async function listHospitals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hospitals")
    .select("*")
    .order("beds_available", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getIncidentTimeline(incidentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_events")
    .select("type, payload, created_at")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
