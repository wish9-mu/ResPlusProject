// Calling again on an accepted incident, and closing an incident.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, jsonRequest, resetFakes, seedIncident, setCaller } from "./helpers/fakes";

vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);

const incidents = await import("@/app/api/incidents/route");
const accept = await import("@/app/api/incidents/[id]/answer/route");
const close = await import("@/app/api/incidents/[id]/close/route");
const token = await import("@/app/api/agora/token/route");

const CALLER = { id: "11111111-1111-4111-8111-111111111111", role: "household" as const };
const BHW = { id: "33333333-3333-4333-8333-333333333333", role: "bhw" as const };
const OTHER_BHW = { id: "44444444-4444-4444-8444-444444444444", role: "bhw" as const };

const post = (body?: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("calling again on an accepted incident", () => {
  beforeEach(() => resetFakes());

  it("lets the same BHW rejoin (accept again) and both get tokens", async () => {
    const incident = seedIncident({ reporter_id: CALLER.id, assigned_bhw: BHW.id });

    // Household's repeat SOS reuses the open incident.
    setCaller(CALLER);
    const again = await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }));
    expect((await again.json()).incidentId).toBe(incident.id);
    expect(
      (await token.POST(jsonRequest("/api/agora/token", { incidentId: incident.id, role: "household" })))
        .status,
    ).toBe(200);

    // Same BHW rejoins; another BHW still can't take it.
    setCaller(BHW);
    expect((await accept.POST(post(), { params: { id: incident.id } })).status).toBe(200);
    setCaller(OTHER_BHW);
    expect((await accept.POST(post(), { params: { id: incident.id } })).status).toBe(409);
  });
});

describe("POST /api/incidents/:id/close", () => {
  beforeEach(() => resetFakes());

  it("lets the assigned BHW close it, logs it, and the next SOS is a new incident", async () => {
    const incident = seedIncident({ reporter_id: CALLER.id, assigned_bhw: BHW.id });
    setCaller(BHW);
    const res = await close.POST(post({ reason: "not_emergency" }), {
      params: { id: incident.id },
    });
    expect(res.status).toBe(200);
    expect(db.incidents.get(incident.id)?.status).toBe("closed");
    expect(db.events.at(-1)).toMatchObject({
      type: "incident_closed",
      payload: { reason: "not_emergency" },
    });

    // Closed: no more call tokens, and the household's next SOS is fresh.
    setCaller(CALLER);
    expect(
      (await token.POST(jsonRequest("/api/agora/token", { incidentId: incident.id, role: "household" })))
        .status,
    ).toBe(403);
    const next = await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }));
    expect(next.status).toBe(201);
    expect((await next.json()).incidentId).not.toBe(incident.id);
  });

  it("works without a body and is idempotent", async () => {
    const incident = seedIncident({ reporter_id: CALLER.id, assigned_bhw: BHW.id });
    setCaller(BHW);
    expect((await close.POST(post(), { params: { id: incident.id } })).status).toBe(200);
    expect((await close.POST(post(), { params: { id: incident.id } })).status).toBe(200);
    expect(db.events.filter((e) => e.type === "incident_closed")).toHaveLength(1);
  });

  it("rejects anyone but the assigned BHW", async () => {
    const incident = seedIncident({ reporter_id: CALLER.id, assigned_bhw: BHW.id });
    for (const who of [CALLER, OTHER_BHW]) {
      setCaller(who);
      expect((await close.POST(post(), { params: { id: incident.id } })).status).toBe(403);
    }
    setCaller(null);
    expect((await close.POST(post(), { params: { id: incident.id } })).status).toBe(401);
    expect(db.incidents.get(incident.id)?.status).toBe("sos");
  });

  it("validates input", async () => {
    setCaller(BHW);
    expect((await close.POST(post(), { params: { id: "nope" } })).status).toBe(400);
    const incident = seedIncident({ reporter_id: CALLER.id, assigned_bhw: BHW.id });
    expect(
      (await close.POST(post({ reason: "bored" }), { params: { id: incident.id } })).status,
    ).toBe(400);
  });
});
