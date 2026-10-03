// POST /api/transcripts: saves final STT segments relayed by the BHW device.
// Body: { incidentId, segments: [{ uid, sentenceId, offset, text }] }
// Duplicates are ignored (source_key), so the client can safely retry.
// A failed save is logged as transcription_failed; it never touches the call.
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api/http";
import { canJoinCall } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import {
  getIncident,
  insertTranscriptSegments,
  logEventSafe,
} from "@/lib/incidents/repo";
import { saveTranscriptSchema, toTranscriptRows } from "@/lib/transcripts/persist";

export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, saveTranscriptSchema);
  if ("response" in body) return body.response;
  const { incidentId, segments } = body.data;

  const incident = await getIncident(incidentId).catch(() => null);
  if (!incident) return jsonError(404, "Incident not found.");

  const decision = canJoinCall("bhw", caller, incident);
  if (!decision.ok) return jsonError(decision.status, decision.reason);

  try {
    const saved = await insertTranscriptSegments(toTranscriptRows(incident.id, segments));
    return NextResponse.json({ saved });
  } catch (error) {
    console.error("[api/transcripts]", (error as Error).message);
    await logEventSafe(incident.id, caller.id, "transcription_failed", {
      reason: "db_write",
    });
    return jsonError(502, "Transcript save failed. The call continues.");
  }
}
