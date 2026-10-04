import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  jsonRequest,
  resetFakes,
  seedIncident,
  setCaller,
  TEST_HOSPITAL_ID,
} from "./helpers/fakes";
import {
  deriveMissingFields,
  EMPTY_TRIAGE,
  normalizeTriage,
  type IncidentTriage,
} from "@/lib/incidents/triage";

vi.mock("@/lib/incidents/repo", async () =>
  (await import("./helpers/fakes")).fakeRepo,
);
vi.mock("@/lib/incidents/caller", async () =>
  (await import("./helpers/fakes")).fakeCaller,
);

const triageRoute = await import("@/app/api/incidents/[id]/triage/route");
const transitionRoute = await import("@/app/api/incidents/[id]/transition/route");
const hospitalRoute = await import("@/app/api/incidents/[id]/hospital/route");

const HOUSEHOLD = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "household" as const,
  hospitalId: null,
};
const BHW = {
  id: "33333333-3333-4333-8333-333333333333",
  role: "bhw" as const,
  hospitalId: null,
};
const OTHER_BHW = {
  id: "44444444-4444-4444-8444-444444444444",
  role: "bhw" as const,
  hospitalId: null,
};
const ER = {
  id: "55555555-5555-4555-8555-555555555555",
  role: "er" as const,
  hospitalId: TEST_HOSPITAL_ID,
};
const OTHER_ER = {
  id: "66666666-6666-4666-8666-666666666666",
  role: "er" as const,
  hospitalId: "88888888-8888-4888-8888-888888888888",
};

const fullTriage: IncidentTriage = {
  patientName: "Juan Dela Cruz",
  age: 67,
  chiefComplaint: "Sudden left-side weakness",
  suspectedCondition: "Suspected stroke",
  onsetTime: "10 minutes ago",
  bloodPressure: "160/95",
  bloodSugar: "130 mg/dL",
  exactLocation: "Blue gate, Mabini Street",
  conditionsAndMeds: "Hypertension; amlodipine",
  allergies: "None known",
  notes: "FAST signs observed",
};

const post = (body: unknown) =>
  jsonRequest("/api/test", body);

function patchTriage(incidentId: string, triage = fullTriage, unstable = false) {
  return triageRoute.PATCH(post({ triage, unstable }), {
    params: { id: incidentId },
  });
}

function transition(incidentId: string, status: string) {
  return transitionRoute.POST(post({ status }), { params: { id: incidentId } });
}

describe("triage normalization and missing fields", () => {
  it("derives the six required handoff fields from an empty card", () => {
    expect(deriveMissingFields(EMPTY_TRIAGE)).toEqual([
      "patient name",
      "age",
      "what happened",
      "onset time",
      "exact location",
      "conditions & meds",
    ]);
  });

  it("normalizes old triage key names without inventing advice", () => {
    const value = normalizeTriage({
      chiefComplaint: "Chest pain",
      suspected: "Possible cardiac event",
      bp: "145/90",
    });
    expect(value).toMatchObject({
      chiefComplaint: "Chest pain",
      suspectedCondition: "Possible cardiac event",
      bloodPressure: "145/90",
      notes: "",
    });
  });
});

describe("PATCH /api/incidents/:id/triage", () => {
  beforeEach(() => resetFakes());

  it("lets the assigned BHW save and derives missing_fields on the server", async () => {
    const incident = seedIncident({ assigned_bhw: BHW.id });
    setCaller(BHW);
    const incomplete = { ...fullTriage, age: null, onsetTime: "" };
    const res = await patchTriage(incident.id, incomplete, true);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      unstable: true,
      missingFields: ["age", "onset time"],
    });
    expect(db.incidents.get(incident.id)).toMatchObject({
      triage: incomplete,
      missing_fields: ["age", "onset time"],
      unstable: true,
    });
    expect(db.events.at(-1)).toMatchObject({
      type: "triage_updated",
      payload: { by: "bhw", missingCount: 2 },
    });
    // Event audit metadata must not duplicate medical/identity content.
    expect(JSON.stringify(db.events.at(-1))).not.toContain("Juan Dela Cruz");
  });

  it("lets ER staff at the assigned hospital edit the same card", async () => {
    const incident = seedIncident({
      assigned_bhw: BHW.id,
      assigned_hospital: TEST_HOSPITAL_ID,
      status: "transporting",
    });
    setCaller(ER);
    const res = await patchTriage(incident.id);
    expect(res.status).toBe(200);
    expect(db.incidents.get(incident.id)?.triage).toEqual(fullTriage);
    expect(db.events.at(-1)?.payload).toMatchObject({ by: "er", missingCount: 0 });
  });

  it.each([
    ["unassigned BHW", OTHER_BHW],
    ["ER at another hospital", OTHER_ER],
    ["household reporter", HOUSEHOLD],
  ])("rejects %s", async (_label, caller) => {
    const incident = seedIncident({
      reporter_id: HOUSEHOLD.id,
      assigned_bhw: BHW.id,
      assigned_hospital: TEST_HOSPITAL_ID,
      status: "transporting",
    });
    setCaller(caller);
    expect((await patchTriage(incident.id)).status).toBe(403);
  });

  it("rejects edits after close and invalid clinical values", async () => {
    const closed = seedIncident({ assigned_bhw: BHW.id, status: "closed" });
    setCaller(BHW);
    expect((await patchTriage(closed.id)).status).toBe(409);

    const open = seedIncident({ assigned_bhw: BHW.id });
    expect(
      (
        await patchTriage(open.id, {
          ...fullTriage,
          age: 999,
        })
      ).status,
    ).toBe(400);
  });
});

describe("POST /api/incidents/:id/transition", () => {
  beforeEach(() => resetFakes());

  it("persists the exact BHW sequence and logs every edge", async () => {
    const incident = seedIncident({ assigned_bhw: BHW.id });
    setCaller(BHW);
    for (const next of [
      "confirmed",
      "bhw_on_scene",
      "ambulance_on_scene",
      "transporting",
    ]) {
      const res = await transition(incident.id, next);
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe(next);
    }
    expect(db.incidents.get(incident.id)?.status).toBe("transporting");
    expect(db.events.filter((event) => event.type === "status_changed")).toHaveLength(4);
  });

  it("rejects skipped/backward transitions and unassigned roles", async () => {
    const incident = seedIncident({ assigned_bhw: BHW.id });
    setCaller(BHW);
    expect((await transition(incident.id, "transporting")).status).toBe(409);
    setCaller(OTHER_BHW);
    expect((await transition(incident.id, "confirmed")).status).toBe(403);
    setCaller(HOUSEHOLD);
    expect((await transition(incident.id, "confirmed")).status).toBe(403);
  });

  it("lets only the assigned ER mark arrival then close handoff", async () => {
    const incident = seedIncident({
      assigned_bhw: BHW.id,
      assigned_hospital: TEST_HOSPITAL_ID,
      status: "transporting",
    });
    setCaller(OTHER_ER);
    expect((await transition(incident.id, "arrived")).status).toBe(403);
    setCaller(ER);
    expect((await transition(incident.id, "arrived")).status).toBe(200);
    expect((await transition(incident.id, "closed")).status).toBe(200);
    expect(db.incidents.get(incident.id)?.status).toBe("closed");
  });
});

describe("POST /api/incidents/:id/hospital", () => {
  beforeEach(() => resetFakes());

  it("records the ambulance-confirmed hospital and enables its ER access", async () => {
    const incident = seedIncident({ assigned_bhw: BHW.id, status: "transporting" });
    setCaller(BHW);
    const res = await hospitalRoute.POST(post({ hospitalId: TEST_HOSPITAL_ID }), {
      params: { id: incident.id },
    });
    expect(res.status).toBe(200);
    expect(db.incidents.get(incident.id)?.assigned_hospital).toBe(TEST_HOSPITAL_ID);
    expect(db.events.at(-1)).toMatchObject({
      type: "hospital_assigned",
      payload: { hospitalId: TEST_HOSPITAL_ID, confirmedBy: "ambulance_crew" },
    });

    // The ER at that hospital can now edit triage.
    setCaller(ER);
    expect((await patchTriage(incident.id)).status).toBe(200);
  });

  it("requires pickup/transporting and the assigned BHW", async () => {
    const incident = seedIncident({ assigned_bhw: BHW.id, status: "ambulance_on_scene" });
    setCaller(BHW);
    expect(
      (
        await hospitalRoute.POST(post({ hospitalId: TEST_HOSPITAL_ID }), {
          params: { id: incident.id },
        })
      ).status,
    ).toBe(409);
    incident.status = "transporting";
    setCaller(OTHER_BHW);
    expect(
      (
        await hospitalRoute.POST(post({ hospitalId: TEST_HOSPITAL_ID }), {
          params: { id: incident.id },
        })
      ).status,
    ).toBe(403);
  });
});
