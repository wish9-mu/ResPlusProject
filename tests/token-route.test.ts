import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, jsonRequest, resetFakes, seedIncident, setCaller } from "./helpers/fakes";

vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);

const { POST } = await import("@/app/api/agora/token/route");

const HOUSEHOLD = { id: "11111111-1111-4111-8111-111111111111", role: "household" as const };
const OTHER_HOUSEHOLD = { id: "22222222-2222-4222-8222-222222222222", role: "household" as const };
const BHW = { id: "33333333-3333-4333-8333-333333333333", role: "bhw" as const };
const OTHER_BHW = { id: "44444444-4444-4444-8444-444444444444", role: "bhw" as const };
const AMBULANCE = { id: "55555555-5555-4555-8555-555555555555", role: "ambulance" as const };

function request(incidentId: string, role: string) {
  return POST(jsonRequest("/api/agora/token", { incidentId, role }));
}

describe("POST /api/agora/token authorization", () => {
  beforeEach(() => resetFakes());
  afterEach(() => vi.unstubAllEnvs());

  it("401 without a signed-in user", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    const res = await request(incident.id, "household");
    expect(res.status).toBe(401);
  });

  it("400 on an invalid body", async () => {
    setCaller(HOUSEHOLD);
    expect((await request("not-a-uuid", "household")).status).toBe(400);
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    expect((await request(incident.id, "admin")).status).toBe(400);
  });

  it("404 for an unknown incident", async () => {
    setCaller(HOUSEHOLD);
    const res = await request("99999999-9999-4999-8999-999999999999", "household");
    expect(res.status).toBe(404);
  });

  it("403 when a household asks for someone else's incident", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    setCaller(OTHER_HOUSEHOLD);
    expect((await request(incident.id, "household")).status).toBe(403);
  });

  it("403 when a household asks for the bhw role", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    setCaller(HOUSEHOLD);
    expect((await request(incident.id, "bhw")).status).toBe(403);
  });

  it("403 for a BHW who has not answered the incident", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(OTHER_BHW);
    expect((await request(incident.id, "bhw")).status).toBe(403);
    const unassigned = seedIncident({ reporter_id: HOUSEHOLD.id });
    setCaller(BHW);
    expect((await request(unassigned.id, "bhw")).status).toBe(403);
  });

  it("403 for other crew roles", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(AMBULANCE);
    expect((await request(incident.id, "bhw")).status).toBe(403);
  });

  it("403 once the incident is closed", async () => {
    const incident = seedIncident({
      reporter_id: HOUSEHOLD.id,
      assigned_bhw: BHW.id,
      status: "closed",
    });
    setCaller(HOUSEHOLD);
    expect((await request(incident.id, "household")).status).toBe(403);
  });

  it("409 for the household until a BHW accepts the emergency", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    setCaller(HOUSEHOLD);
    expect((await request(incident.id, "household")).status).toBe(409);
  });

  it("lets any device that raised the SOS join as household (e.g. a crew phone)", async () => {
    const incident = seedIncident({ reporter_id: OTHER_BHW.id, assigned_bhw: BHW.id });
    setCaller(OTHER_BHW);
    expect((await request(incident.id, "household")).status).toBe(200);
  });

  it("issues a household token bound to uid 100 and the incident channel", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(HOUSEHOLD);
    const res = await request(incident.id, "household");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json();
    expect(body.channel).toBe(`incident_${incident.id}`);
    expect(body.uid).toBe(100);
    expect(body.appId).toBe(process.env.NEXT_PUBLIC_AGORA_APP_ID);
    expect(body.token).toMatch(/^007/); // Agora AccessToken2
    const now = Math.floor(Date.now() / 1000);
    expect(body.expiresAt).toBeGreaterThan(now + 30 * 60);
    expect(body.expiresAt).toBeLessThanOrEqual(now + 60 * 60);
  });

  it("issues a BHW token bound to uid 200 for the assigned BHW", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(BHW);
    const res = await request(incident.id, "bhw");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uid).toBe(200);
    expect(body.channel).toBe(`incident_${incident.id}`);
  });

  it("never returns the App Certificate", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(HOUSEHOLD);
    const text = await (await request(incident.id, "household")).text();
    expect(text).not.toContain(process.env.AGORA_APP_CERTIFICATE!);
    expect(text).not.toMatch(/certificate/i);
  });

  it("503 when Agora is not configured on the server", async () => {
    vi.stubEnv("AGORA_APP_CERTIFICATE", "");
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id, assigned_bhw: BHW.id });
    setCaller(HOUSEHOLD);
    expect((await request(incident.id, "household")).status).toBe(503);
  });

  it("does not write anything", async () => {
    const incident = seedIncident({ reporter_id: HOUSEHOLD.id });
    setCaller(HOUSEHOLD);
    await request(incident.id, "household");
    expect(db.events).toHaveLength(0);
  });
});
