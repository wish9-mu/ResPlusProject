// POST /api/incidents/:id/transition
// Persists one legal, role-owned status transition and logs it. The expected
// current state is checked in the database to reject stale concurrent clicks.
import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError, readJson } from "@/lib/api/http";
import { canTransitionStatus } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import {
  getIncident,
  logEventSafe,
  transitionIncidentStatus,
} from "@/lib/incidents/repo";

const schema = z
  .object({
    status: z.enum([
      "sos",
      "confirmed",
      "bhw_on_scene",
      "ambulance_on_scene",
      "transporting",
      "arrived",
      "closed",
    ]),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const id = incidentIdSchema.safeParse(params.id);
  if (!id.success) return jsonError(400, "Invalid incident id.");
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");
  const body = await readJson(request, schema);
  if ("response" in body) return body.response;

  try {
    const incident = await getIncident(id.data);
    if (!incident) return jsonError(404, "Incident not found.");
    const access = canTransitionStatus(caller, incident, body.data.status);
    if (!access.ok) return jsonError(access.status, access.reason);

    const updated = await transitionIncidentStatus(
      incident.id,
      incident.status,
      body.data.status,
    );
    if (!updated) {
      return jsonError(409, "The status changed on another device. Reload and try again.");
    }
    await logEventSafe(incident.id, caller.id, "status_changed", {
      from: incident.status,
      to: body.data.status,
      by: caller.role,
    });
    return NextResponse.json({ status: updated.status, updatedAt: updated.updated_at });
  } catch (error) {
    console.error("[api/incidents/transition]", (error as Error).message);
    return jsonError(500, "Could not update the status. Try again.");
  }
}
