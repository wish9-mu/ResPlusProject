// Pure call helpers shared by server and browser. No secrets, no SDK.
import { z } from "zod";

// One household and one BHW per incident call, so each role gets a fixed RTC
// uid. Tokens are bound to the uid, and the uid tells STT who is speaking.
export const CALL_UIDS = {
  household: 100,
  bhw: 200,
  stt: 900, // Agora Real-Time STT bot
} as const;

export const callRoleSchema = z.enum(["household", "bhw"]);
export type CallRole = z.infer<typeof callRoleSchema>;

export const incidentIdSchema = z.uuid();

export function isIncidentId(value: unknown): value is string {
  return incidentIdSchema.safeParse(value).success;
}

// Agora channel name for an incident. Built only from the incident UUID, so it
// never carries a name, phone number, address, or medical condition.
export function channelForIncident(incidentId: string): string {
  if (!isIncidentId(incidentId)) {
    throw new Error("incidentId must be a UUID");
  }
  return `incident_${incidentId.toLowerCase()}`;
}

export function uidForRole(role: CallRole): number {
  return CALL_UIDS[role];
}

// Maps an RTC uid back to the speaker label stored in transcript_segments.
export function speakerForUid(uid: number): CallRole | "unknown" {
  if (uid === CALL_UIDS.household) return "household";
  if (uid === CALL_UIDS.bhw) return "bhw";
  return "unknown";
}

// Lifecycle events written to incident_events for the call feature.
export const CALL_EVENT_TYPES = [
  "call_started",
  "call_answered",
  "call_ended",
  "call_failed",
  "transcription_started",
  "transcription_failed",
] as const;
export type CallEventType = (typeof CALL_EVENT_TYPES)[number];
