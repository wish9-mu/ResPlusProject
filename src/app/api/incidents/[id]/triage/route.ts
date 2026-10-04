// PATCH /api/incidents/:id/triage
// Assigned BHW or staff at the assigned ER only. Stores one validated factual
// triage document and derives missing_fields on the server.
import { NextResponse } from "next/server";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError, readJson } from "@/lib/api/http";
import { canEditTriage } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import {
  getIncident,
  logEventSafe,
  updateIncidentTriage,
} from "@/lib/incidents/repo";
import {
  deriveMissingFields,
  triageUpdateSchema,
} from "@/lib/incidents/triage";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const id = incidentIdSchema.safeParse(params.id);
  if (!id.success) return jsonError(400, "Invalid incident id.");

  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, triageUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const incident = await getIncident(id.data);
    if (!incident) return jsonError(404, "Incident not found.");
    const access = canEditTriage(caller, incident);
    if (!access.ok) return jsonError(access.status, access.reason);

    const missingFields = deriveMissingFields(body.data.triage);
    const updated = await updateIncidentTriage(
      incident.id,
      body.data.triage,
      missingFields,
      body.data.unstable,
    );
    if (!updated) return jsonError(409, "The incident was closed. Reload the card.");

    // Do not copy clinical/identity content into the event payload.
    await logEventSafe(incident.id, caller.id, "triage_updated", {
      by: caller.role,
      missingCount: missingFields.length,
    });
    return NextResponse.json({
      triage: body.data.triage,
      missingFields,
      unstable: body.data.unstable,
      updatedAt: updated.updated_at,
    });
  } catch (error) {
    console.error("[api/incidents/triage]", (error as Error).message);
    return jsonError(500, "Could not save the triage card. Try again.");
  }
}
