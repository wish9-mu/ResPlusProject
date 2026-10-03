// POST /api/agora/token: short-lived RTC token for an incident call.
// Body: { incidentId, role: "household" | "bhw" }
// Only the incident's reporter (household) or assigned BHW gets a token.
// The App Certificate stays on the server; only the signed token is returned.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  callRoleSchema,
  channelForIncident,
  incidentIdSchema,
  uidForRole,
} from "@/lib/agora/channel";
import { AgoraConfigError, buildRtcToken } from "@/lib/agora/token";
import { jsonError, readJson } from "@/lib/api/http";
import { canJoinCall } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import { getIncident } from "@/lib/incidents/repo";

const schema = z.object({
  incidentId: incidentIdSchema,
  role: callRoleSchema,
});

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, schema);
  if ("response" in body) return body.response;
  const { incidentId, role } = body.data;

  try {
    const incident = await getIncident(incidentId);
    if (!incident) return jsonError(404, "Incident not found.");

    const decision = canJoinCall(role, caller, incident);
    if (!decision.ok) return jsonError(decision.status, decision.reason);

    const grant = buildRtcToken(channelForIncident(incident.id), uidForRole(role));
    return NextResponse.json(grant, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AgoraConfigError) {
      return jsonError(503, "Calling is not configured. Use the phone fallback.");
    }
    console.error("[api/agora/token]", (error as Error).message);
    return jsonError(500, "Could not start the call. Use the phone fallback.");
  }
}
