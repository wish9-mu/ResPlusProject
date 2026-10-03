// POST /api/agora/transcription/stop: stops the STT agent when the call ends.
// Body: { incidentId, agentId }. Assigned BHW only. Best effort: the agent also
// stops itself after STT_MAX_IDLE_SECONDS of an empty channel.
import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentIdSchema } from "@/lib/agora/channel";
import { agentIdSchema, stopTranscription } from "@/lib/agora/transcription";
import { jsonError, readJson } from "@/lib/api/http";
import { getCaller } from "@/lib/incidents/caller";
import { getIncident } from "@/lib/incidents/repo";

const schema = z.object({ incidentId: incidentIdSchema, agentId: agentIdSchema });

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, schema);
  if ("response" in body) return body.response;

  const incident = await getIncident(body.data.incidentId).catch(() => null);
  if (!incident) return jsonError(404, "Incident not found.");

  // Closed incidents still need their agent stopped, so only check assignment.
  if (caller.role !== "bhw" || incident.assigned_bhw !== caller.id) {
    return jsonError(403, "Only the BHW who answered this incident can stop it.");
  }

  try {
    await stopTranscription(body.data.agentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/agora/transcription/stop]", (error as Error).message);
    return jsonError(502, "Could not stop the transcript agent; it will time out.");
  }
}
