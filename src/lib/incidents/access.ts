// Pure authorization rules for incident calls. Kept free of I/O so they are
// easy to unit test; route handlers load the data and call these.
import type { CallRole } from "@/lib/agora/channel";
import type { Caller } from "./caller";
import type { IncidentRecord } from "./repo";

export type AccessDecision =
  | { ok: true }
  | { ok: false; status: 403 | 409; reason: string };

const allow: AccessDecision = { ok: true };
const deny = (reason: string, status: 403 | 409 = 403): AccessDecision => ({
  ok: false,
  status,
  reason,
});

// Whoever raised the SOS is the household side of its call. Usually an
// anonymous household session, but any device may raise an SOS (a crew
// member can have an emergency too), so the role is not checked here.
function isReporter(caller: Caller, incident: IncidentRecord) {
  return incident.reporter_id !== null && incident.reporter_id === caller.id;
}

function isAssignedBhw(caller: Caller, incident: IncidentRecord) {
  return caller.role === "bhw" && incident.assigned_bhw === caller.id;
}

// May this caller join the incident's Agora channel in the given role?
export function canJoinCall(
  callRole: CallRole,
  caller: Caller,
  incident: IncidentRecord,
): AccessDecision {
  if (incident.status === "closed") return deny("This incident is closed.");
  if (callRole === "household") {
    if (!isReporter(caller, incident)) {
      return deny("Only the person who raised this SOS can join as household.");
    }
    // A health worker must accept the emergency before the call connects.
    return incident.assigned_bhw
      ? allow
      : deny("Waiting for a health worker to accept.", 409);
  }
  return isAssignedBhw(caller, incident)
    ? allow
    : deny("Only the BHW who answered this incident can join.");
}

// May this BHW answer (claim) the incident? First BHW to answer wins.
export function canClaim(caller: Caller, incident: IncidentRecord): AccessDecision {
  if (caller.role !== "bhw") return deny("Only BHWs can answer calls.");
  if (incident.status === "closed") return deny("This incident is closed.");
  if (incident.assigned_bhw && incident.assigned_bhw !== caller.id) {
    return deny("Another health worker already answered.", 409);
  }
  return allow;
}

// May this caller log call lifecycle events for the incident?
export function canLogCallEvent(
  caller: Caller,
  incident: IncidentRecord,
): AccessDecision {
  return isReporter(caller, incident) || isAssignedBhw(caller, incident)
    ? allow
    : deny("You are not part of this incident.");
}
