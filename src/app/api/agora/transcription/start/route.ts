// POST /api/agora/transcription/start: starts Agora Real-Time STT for the call.
// Body: { incidentId }. Assigned BHW only. Failure here never affects the call:
// it is logged as transcription_failed and the client keeps talking.
import { NextResponse } from "next/server";
import { z } from "zod";
import { channelForIncident, incidentIdSchema } from "@/lib/agora/channel";
import { SttUnavailableError, startTranscription } from "@/lib/agora/transcription";
import { jsonError, readJson } from "@/lib/api/http";
import { canJoinCall } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import { getIncident, logEventSafe } from "@/lib/incidents/repo";

const schema = z.object({ incidentId: incidentIdSchema });

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, schema);
  if ("response" in body) return body.response;

  const incident = await getIncident(body.data.incidentId).catch(() => null);
  if (!incident) return jsonError(404, "Incident not found.");

  const decision = canJoinCall("bhw", caller, incident);
  if (!decision.ok) return jsonError(decision.status, decision.reason);

  try {
    const { agentId } = await startTranscription(
      channelForIncident(incident.id),
      incident.id,
    );
    await logEventSafe(incident.id, caller.id, "transcription_started", { agentId });
    return NextResponse.json({ agentId });
  } catch (error) {
    const reason =
      error instanceof SttUnavailableError ? error.reason : "request_failed";
    console.error("[api/agora/transcription/start]", (error as Error).message);
    await logEventSafe(incident.id, caller.id, "transcription_failed", { reason });
    return NextResponse.json(
      { error: "Live transcript unavailable. The call continues.", reason },
      { status: 503 },
    );
  }
}
