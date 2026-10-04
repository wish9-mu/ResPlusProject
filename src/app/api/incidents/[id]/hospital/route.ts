// POST /api/incidents/:id/hospital
// The assigned BHW records the destination only after the ambulance crew has
// explicitly confirmed it. This does not let AI or the BHW silently decide.
import { NextResponse } from "next/server";
import { z } from "zod";
import { incidentIdSchema } from "@/lib/agora/channel";
import { jsonError, readJson } from "@/lib/api/http";
import { canAssignHospital } from "@/lib/incidents/access";
import { getCaller } from "@/lib/incidents/caller";
import {
  assignIncidentHospital,
  getHospital,
  getIncident,
  logEventSafe,
} from "@/lib/incidents/repo";

const schema = z.object({ hospitalId: z.uuid() }).strict();

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
    const access = canAssignHospital(caller, incident);
    if (!access.ok) return jsonError(access.status, access.reason);

    const hospital = await getHospital(body.data.hospitalId);
    if (!hospital) return jsonError(404, "Hospital not found.");
    if (hospital.is_diverting) {
      return jsonError(409, "That hospital is diverting. Choose another hospital.");
    }

    const updated = await assignIncidentHospital(
      incident.id,
      caller.id,
      hospital.id,
    );
    if (!updated) {
      return jsonError(409, "The incident changed. Reload and confirm the destination again.");
    }
    await logEventSafe(incident.id, caller.id, "hospital_assigned", {
      hospitalId: hospital.id,
      by: caller.role,
      confirmedBy: "ambulance_crew",
    });
    return NextResponse.json({ hospitalId: hospital.id, hospitalName: hospital.name });
  } catch (error) {
    console.error("[api/incidents/hospital]", (error as Error).message);
    return jsonError(500, "Could not notify the hospital. Try again.");
  }
}
