// POST /api/incidents: the household SOS. Creates (or reuses) the caller's open
// incident so the call has a real incident id. Never blocks on AI or calls.
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api/http";
import { getCaller } from "@/lib/incidents/caller";
import {
  createIncident,
  findDemoPatientId,
  findOpenIncidentForReporter,
  logEventSafe,
} from "@/lib/incidents/repo";

const phPoint = z.object({
  lat: z.number().min(4).max(22),
  lng: z.number().min(116).max(127),
});

const schema = z.object({
  withProfile: z.boolean(),
  note: z.string().trim().max(500).optional(),
  location: phPoint.nullable().optional(),
});

export async function POST(request: Request) {
  // Any device can raise an SOS (FLOW.md: never a dead end). Households get an
  // anonymous session first; a crew session on this device is accepted too.
  const caller = await getCaller();
  if (!caller) return jsonError(401, "Sign in required.");

  const body = await readJson(request, schema);
  if ("response" in body) return body.response;
  const { withProfile, note, location } = body.data;

  try {
    const existing = await findOpenIncidentForReporter(caller.id);
    if (existing) {
      return NextResponse.json({ incidentId: existing.id, reused: true });
    }

    const incident = await createIncident({
      reporterId: caller.id,
      patientId: withProfile ? await findDemoPatientId() : null,
      note: note || null,
      location: location ?? null,
    });
    await logEventSafe(incident.id, caller.id, "sos_created", {
      registered: withProfile,
      reporterRole: caller.role,
    });
    return NextResponse.json({ incidentId: incident.id, reused: false }, { status: 201 });
  } catch (error) {
    console.error("[api/incidents]", (error as Error).message);
    return jsonError(500, "Could not record the SOS. Call by phone or 911.");
  }
}
