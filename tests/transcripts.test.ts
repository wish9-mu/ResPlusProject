import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_UIDS } from "@/lib/agora/channel";
import { sourceKey, toTranscriptRows } from "@/lib/transcripts/persist";
import { db, jsonRequest, resetFakes, seedIncident, setCaller } from "./helpers/fakes";

vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);

const { POST } = await import("@/app/api/transcripts/route");

const HOUSEHOLD = { id: "11111111-1111-4111-8111-111111111111", role: "household" as const };
const BHW = { id: "33333333-3333-4333-8333-333333333333", role: "bhw" as const };
const OTHER_BHW = { id: "44444444-4444-4444-8444-444444444444", role: "bhw" as const };

const householdLine = {
  uid: CALL_UIDS.household,
  sentenceId: 1,
  offset: 0,
  text: "Biglang nanghina yung kaliwang side niya.",
};
const bhwLine = { uid: CALL_UIDS.bhw, sentenceId: 2, offset: 4200, text: "Anong oras po nagsimula?" };

describe("toTranscriptRows", () => {
  it("labels speakers by uid and builds a stable source key", () => {
    const rows = toTranscriptRows("inc", [householdLine, bhwLine]);
    expect(rows).toEqual([
      {
        incident_id: "inc",
        speaker: "household",
        text: householdLine.text,
        source_key: `${CALL_UIDS.household}:1:0`,
      },
      {
        incident_id: "inc",
        speaker: "bhw",
        text: bhwLine.text,
        source_key: `${CALL_UIDS.bhw}:2:4200`,
      },
    ]);
  });

  it("drops duplicates within one batch", () => {
    expect(toTranscriptRows("inc", [householdLine, { ...householdLine }])).toHaveLength(1);
    expect(sourceKey(householdLine)).toBe(sourceKey({ ...householdLine }));
  });
});

describe("POST /api/transcripts", () => {
  let incidentId: string;
  beforeEach(() => {
    resetFakes();
    incidentId = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id }).id;
    setCaller(BHW);
  });

  const save = (segments: unknown[]) =>
    POST(jsonRequest("/api/transcripts", { incidentId, segments }));

  it("persists final segments with speaker labels", async () => {
    const res = await save([householdLine, bhwLine]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 2 });
    const stored = [...db.transcripts.values()];
    expect(stored.map((r) => [r.speaker, r.text])).toEqual([
      ["household", householdLine.text],
      ["bhw", bhwLine.text],
    ]);
    expect(stored.every((r) => r.incident_id === incidentId)).toBe(true);
  });

  it("is idempotent: retrying the same batch saves nothing new", async () => {
    await save([householdLine]);
    const retry = await save([householdLine]);
    expect(await retry.json()).toEqual({ saved: 0 });
    expect(db.transcripts.size).toBe(1);
  });

  it("returns 502 and logs transcription_failed when the database write fails", async () => {
    db.failTranscriptWrites = true;
    const res = await save([householdLine]);
    expect(res.status).toBe(502);
    expect(db.events).toContainEqual(
      expect.objectContaining({
        incidentId,
        type: "transcription_failed",
        payload: { reason: "db_write" },
      }),
    );
  });

  it("rejects a BHW who is not on the incident", async () => {
    setCaller(OTHER_BHW);
    expect((await save([householdLine])).status).toBe(403);
    expect(db.transcripts.size).toBe(0);
  });

  it("rejects the household (only the BHW device relays transcripts)", async () => {
    setCaller(HOUSEHOLD);
    expect((await save([householdLine])).status).toBe(403);
  });

  it("validates the payload", async () => {
    expect((await save([])).status).toBe(400);
    expect((await save([{ ...householdLine, text: "   " }])).status).toBe(400);
    expect((await save([{ ...householdLine, uid: -1 }])).status).toBe(400);
    expect((await save(Array.from({ length: 26 }, (_, i) => ({ ...householdLine, offset: i })))).status).toBe(400);
  });
});
