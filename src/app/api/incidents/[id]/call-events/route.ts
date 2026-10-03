// POST /api/incidents/:id/call-events: logs call lifecycle events from either
// side of the call. call_started from the household is what rings the BHWs.
import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError, readJson } from "@/lib/api/http";
import { canLogCallEvent } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import { getIncident, logEvent } from "@/lib/incidents/repo";

const schema = z.object({
  type: z.enum(["call_started", "call_ended", "call_failed"]),
  // Short machine-readable reason, e.g. "mic_denied", "timeout".
  reason: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
});

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

    const decision = canLogCallEvent(caller, incident);
    if (!decision.ok) return jsonError(decision.status, decision.reason);

    await logEvent(incident.id, caller.id, body.data.type, {
      by: caller.role,
      ...(body.data.reason ? { reason: body.data.reason } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/call-events]", (error as Error).message);
    return jsonError(500, "Could not log the call event.");
  }
}
