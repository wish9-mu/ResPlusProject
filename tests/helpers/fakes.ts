// In-memory stand-ins for the database layer and the signed-in user, so route
// handlers can be tested without Supabase. Wire them in with:
//   vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
//   vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);
import { randomUUID } from "node:crypto";
import type { Caller } from "@/lib/incidents/caller";
import type {
  IncidentEventType,
  IncidentRecord,
  TranscriptRow,
} from "@/lib/incidents/repo";

export interface StoredEvent {
  incidentId: string;
  actorId: string | null;
  type: IncidentEventType;
  payload: Record<string, unknown>;
}

export const db = {
  incidents: new Map<string, IncidentRecord>(),
  events: [] as StoredEvent[],
  transcripts: new Map<string, TranscriptRow & { id: string }>(),
  failTranscriptWrites: false,
};

let currentCaller: Caller | null = null;

export function setCaller(caller: Caller | null) {
  currentCaller = caller;
}

export function resetFakes() {
  db.incidents.clear();
  db.events.length = 0;
  db.transcripts.clear();
  db.failTranscriptWrites = false;
  currentCaller = null;
}

export function seedIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  const record: IncidentRecord = {
    id: randomUUID(),
    status: "sos",
    reporter_id: null,
    assigned_bhw: null,
    patient_id: null,
    note: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  db.incidents.set(record.id, record);
  return record;
}

export const fakeCaller = {
  getCaller: async () => currentCaller,
};

async function logEvent(
  incidentId: string,
  actorId: string | null,
  type: IncidentEventType,
  payload: Record<string, unknown> = {},
) {
  db.events.push({ incidentId, actorId, type, payload });
}

export const fakeRepo = {
  getIncident: async (id: string) => {
    const found = db.incidents.get(id);
    return found ? { ...found } : null;
  },
  findOpenIncidentForReporter: async (reporterId: string) =>
    [...db.incidents.values()]
      .filter((i) => i.reporter_id === reporterId && i.status !== "closed")
      .at(-1) ?? null,
  findDemoPatientId: async () => null,
  createIncident: async (input: {
    reporterId: string;
    patientId: string | null;
    note: string | null;
  }) =>
    seedIncident({
      reporter_id: input.reporterId,
      patient_id: input.patientId,
      note: input.note,
    }),
  // Mirrors the real atomic claim: only if unassigned (or already ours).
  claimIncident: async (id: string, bhwId: string) => {
    const incident = db.incidents.get(id);
    if (!incident || incident.status === "closed") return null;
    if (incident.assigned_bhw && incident.assigned_bhw !== bhwId) return null;
    incident.assigned_bhw = bhwId;
    return { ...incident };
  },
  logEvent,
  logEventSafe: async (...args: Parameters<typeof logEvent>) => {
    await logEvent(...args);
    return true;
  },
  // Mirrors upsert ... on conflict (source_key) do nothing.
  insertTranscriptSegments: async (rows: TranscriptRow[]) => {
    if (db.failTranscriptWrites) throw new Error("database unavailable");
    let inserted = 0;
    for (const row of rows) {
      if (db.transcripts.has(row.source_key)) continue;
      db.transcripts.set(row.source_key, { ...row, id: randomUUID() });
      inserted++;
    }
    return inserted;
  },
  getPatientSummary: async () => null,
};

export function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
