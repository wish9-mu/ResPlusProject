// POST /api/incidents/:id/answer: a BHW answers the incoming call. The first
// BHW to answer is assigned; everyone else gets 409.
import { NextResponse } from "next/server";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError } from "@/lib/api/http";
import { canClaim } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import {
  claimIncident,
  getIncident,
  getIncidentLocation,
  getPatientSummary,
  logEventSafe,
} from "@/lib/incidents/repo";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const id = incidentIdSchema.safeParse(params.id);
  if (!id.success) return jsonError(400, "Invalid incident id.");

  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  try {
    const incident = await getIncident(id.data);
    if (!incident) return jsonError(404, "Incident not found.");

    const decision = canClaim(caller, incident);
    if (!decision.ok) return jsonError(decision.status, decision.reason);

    const claimed = await claimIncident(incident.id, caller.id);
    if (!claimed) return jsonError(409, "Another health worker already answered.");

    await logEventSafe(claimed.id, caller.id, "call_answered");
    // Patient details and the caller's location only go to the BHW who
    // accepted, never to the queue.
    const [patient, location] = await Promise.all([
      getPatientSummary(claimed.patient_id),
      getIncidentLocation(claimed.id),
    ]);
    return NextResponse.json({
      incidentId: claimed.id,
      patientName: patient?.name ?? null,
      patient,
      note: claimed.note,
      location,
    });
  } catch (error) {
    console.error("[api/incidents/answer]", (error as Error).message);
    return jsonError(500, "Could not answer the call. Call the household by phone.");
  }
}
