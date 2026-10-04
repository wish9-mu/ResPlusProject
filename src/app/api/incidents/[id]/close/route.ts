// POST /api/incidents/:id/close: the assigned BHW closes the incident
// (resolved, or not an emergency). Body: { reason?: "resolved" | "not_emergency" }
// After this the household's next SOS creates a new incident.
import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError } from "@/lib/api/http";
import { getCaller } from "@/lib/incidents/caller";
import { closeIncident, getIncident, logEventSafe } from "@/lib/incidents/repo";

const schema = z
  .object({ reason: z.enum(["resolved", "not_emergency"]).optional() })
  .optional();

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const id = incidentIdSchema.safeParse(params.id);
  if (!id.success) return jsonError(400, "Invalid incident id.");

  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  // Body is optional.
  let body: unknown = undefined;
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError(400, "Body must be JSON.");
    }
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid request.");

  try {
    const incident = await getIncident(id.data);
    if (!incident) return jsonError(404, "Incident not found.");
    if (caller.role !== "bhw" || incident.assigned_bhw !== caller.id) {
      return jsonError(403, "Only the BHW who accepted this incident can close it.");
    }
    if (incident.status === "closed") return NextResponse.json({ ok: true });

    const closed = await closeIncident(incident.id, caller.id);
    if (!closed) return jsonError(409, "The incident changed. Reload and try again.");

    await logEventSafe(incident.id, caller.id, "incident_closed", {
      reason: parsed.data?.reason ?? "resolved",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/incidents/close]", (error as Error).message);
    return jsonError(500, "Could not close the incident.");
  }
}
