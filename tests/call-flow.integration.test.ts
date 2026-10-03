// Any phone raises an SOS -> it appears for every BHW -> a BHW accepts first ->
// only then can the household join -> both get tokens for the same incident
// channel -> STT starts -> a subtitle message from the channel is decoded and
// relayed -> the transcript row appears.
// Agora (RTC + STT REST) and Supabase are replaced with fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_UIDS } from "@/lib/agora/channel";
import { decodeSttPayload } from "@/lib/agora/stt-message";
import { db, jsonRequest, resetFakes, setCaller } from "./helpers/fakes";

vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);
vi.mock("@/lib/agora/transcription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agora/transcription")>()),
  startTranscription: vi.fn(async () => ({ agentId: "agent_test_1" })),
  stopTranscription: vi.fn(async () => undefined),
}));

const incidents = await import("@/app/api/incidents/route");
const accept = await import("@/app/api/incidents/[id]/answer/route");
const callEvents = await import("@/app/api/incidents/[id]/call-events/route");
const token = await import("@/app/api/agora/token/route");
const sttStart = await import("@/app/api/agora/transcription/start/route");
const transcripts = await import("@/app/api/transcripts/route");
const { startTranscription } = await import("@/lib/agora/transcription");

// An anonymous, unregistered phone.
const CALLER = { id: "11111111-1111-4111-8111-111111111111", role: "household" as const };
const BHW = { id: "33333333-3333-4333-8333-333333333333", role: "bhw" as const };
const LATE_BHW = { id: "44444444-4444-4444-8444-444444444444", role: "bhw" as const };
const AMBULANCE = { id: "55555555-5555-4555-8555-555555555555", role: "ambulance" as const };

const post = () => new Request("http://localhost/x", { method: "POST" });
const tokenFor = (incidentId: string, role: "household" | "bhw") =>
  token.POST(jsonRequest("/api/agora/token", { incidentId, role }));

// What Agora STT pushes into the channel with enableJsonProtocol: gzip'd JSON.
async function sttMessage(transcript: Record<string, unknown>): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify({ transcript }));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("SOS -> BHW accepts -> call with live transcript", () => {
  beforeEach(() => resetFakes());

  it("connects both sides on one incident channel only after acceptance", async () => {
    // 1. Unregistered phone taps SOS -> new incident, unassigned.
    setCaller(CALLER);
    const sos = await incidents.POST(
      jsonRequest("/api/incidents", { withProfile: false, note: "lola collapsed" }),
    );
    expect(sos.status).toBe(201);
    const { incidentId } = (await sos.json()) as { incidentId: string };
    expect(db.incidents.get(incidentId)).toMatchObject({
      reporter_id: CALLER.id,
      assigned_bhw: null,
      patient_id: null,
      note: "lola collapsed",
    });

    // A second tap reuses the same open incident.
    const again = await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }));
    expect((await again.json()).incidentId).toBe(incidentId);

    // 2. Before acceptance nobody can join: household waits (409), BHW 403.
    expect((await tokenFor(incidentId, "household")).status).toBe(409);
    setCaller(BHW);
    expect((await tokenFor(incidentId, "bhw")).status).toBe(403);

    // 3. BHW accepts first; a second BHW is too late; non-BHW crew can't.
    const accepted = await accept.POST(post(), { params: { id: incidentId } });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).patientName).toBeNull(); // unregistered caller
    setCaller(LATE_BHW);
    expect((await accept.POST(post(), { params: { id: incidentId } })).status).toBe(409);
    setCaller(AMBULANCE);
    expect((await accept.POST(post(), { params: { id: incidentId } })).status).toBe(403);

    // 4. Now both sides join: same channel, different uids.
    setCaller(BHW);
    const bhwRes = await tokenFor(incidentId, "bhw");
    expect(bhwRes.status).toBe(200);
    const bhw = await bhwRes.json();

    setCaller(CALLER);
    const hhRes = await tokenFor(incidentId, "household");
    expect(hhRes.status).toBe(200);
    const household = await hhRes.json();
    await callEvents.POST(
      jsonRequest(`/api/incidents/${incidentId}/call-events`, { type: "call_started" }),
      { params: { id: incidentId } },
    );

    expect(household.channel).toBe(`incident_${incidentId}`);
    expect(bhw.channel).toBe(household.channel);
    expect(household.uid).toBe(CALL_UIDS.household);
    expect(bhw.uid).toBe(CALL_UIDS.bhw);

    // 5. Live transcription starts for that channel.
    setCaller(BHW);
    const stt = await sttStart.POST(
      jsonRequest("/api/agora/transcription/start", { incidentId }),
    );
    expect(stt.status).toBe(200);
    expect(startTranscription).toHaveBeenCalledWith(`incident_${incidentId}`, incidentId);

    // 6. STT pushes subtitles into the channel; the BHW device decodes them.
    const partial = await decodeSttPayload(
      await sttMessage({
        uid: CALL_UIDS.household,
        sentenceId: 7,
        isFinal: false,
        results: [{ text: "Biglang nang", isFinal: false, offset: 0 }],
      }),
    );
    expect(partial).toEqual([expect.objectContaining({ isFinal: false })]);

    const finals = (
      await decodeSttPayload(
        await sttMessage({
          uid: CALL_UIDS.household,
          sentenceId: 7,
          isFinal: true,
          results: [
            { text: "Biglang nanghina yung kaliwang side niya.", isFinal: true, offset: 0 },
          ],
        }),
      )
    ).filter((s) => s.isFinal);

    // 7. ...and relays the final segment, which is stored.
    const saved = await transcripts.POST(
      jsonRequest("/api/transcripts", {
        incidentId,
        segments: finals.map(({ uid, sentenceId, offset, text }) => ({
          uid,
          sentenceId,
          offset,
          text,
        })),
      }),
    );
    expect(saved.status).toBe(200);
    expect([...db.transcripts.values()]).toEqual([
      expect.objectContaining({
        incident_id: incidentId,
        speaker: "household",
        text: "Biglang nanghina yung kaliwang side niya.",
      }),
    ]);

    // Lifecycle is on the incident timeline, acceptance before the call.
    expect(db.events.map((e) => e.type)).toEqual([
      "sos_created",
      "call_answered",
      "call_started",
      "transcription_started",
    ]);
  });

  it("creates a new entry even when the SOS comes from a crew-signed device", async () => {
    setCaller(AMBULANCE);
    const sos = await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }));
    expect(sos.status).toBe(201);
    const { incidentId } = await sos.json();
    expect(db.incidents.get(incidentId)?.assigned_bhw).toBeNull();
    expect(db.events[0]).toMatchObject({
      type: "sos_created",
      payload: { reporterRole: "ambulance" },
    });
  });

  it("keeps the call usable when transcription fails to start", async () => {
    vi.mocked(startTranscription).mockRejectedValueOnce(
      new (await import("@/lib/agora/transcription")).SttUnavailableError(
        "down",
        "request_failed",
      ),
    );
    setCaller(CALLER);
    const { incidentId } = await (
      await incidents.POST(jsonRequest("/api/incidents", { withProfile: true }))
    ).json();
    setCaller(BHW);
    await accept.POST(post(), { params: { id: incidentId } });

    const stt = await sttStart.POST(
      jsonRequest("/api/agora/transcription/start", { incidentId }),
    );
    expect(stt.status).toBe(503);
    expect(db.events.at(-1)).toMatchObject({
      type: "transcription_failed",
      payload: { reason: "request_failed" },
    });

    // The audio call is unaffected: both sides can still get tokens.
    expect((await tokenFor(incidentId, "bhw")).status).toBe(200);
    setCaller(CALLER);
    expect((await tokenFor(incidentId, "household")).status).toBe(200);
  });
});
