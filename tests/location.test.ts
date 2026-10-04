import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEwkbPoint } from "@/lib/geo/ewkb";
import { db, jsonRequest, resetFakes, setCaller } from "./helpers/fakes";

vi.mock("@/lib/incidents/repo", async () => (await import("./helpers/fakes")).fakeRepo);
vi.mock("@/lib/incidents/caller", async () => (await import("./helpers/fakes")).fakeCaller);

const incidents = await import("@/app/api/incidents/route");
const accept = await import("@/app/api/incidents/[id]/answer/route");

describe("parseEwkbPoint", () => {
  it("decodes the exact value Supabase returned for QC General Hospital", () => {
    // Seeded as st_point(121.043, 14.676) -> PostgREST hex EWKB.
    const point = parseEwkbPoint("0101000020E6100000986E1283C0425E40273108AC1C5A2D40");
    expect(point?.lng).toBeCloseTo(121.043, 6);
    expect(point?.lat).toBeCloseTo(14.676, 6);
  });

  it.each([null, undefined, 42, "", "zz", "0101", "0102000020E6100000"])(
    "returns null for %j",
    (value) => {
      expect(parseEwkbPoint(value)).toBeNull();
    },
  );
});

describe("caller location on accept", () => {
  const CALLER = { id: "11111111-1111-4111-8111-111111111111", role: "household" as const };
  const BHW = { id: "33333333-3333-4333-8333-333333333333", role: "bhw" as const };
  const post = () => new Request("http://localhost/x", { method: "POST" });

  beforeEach(() => resetFakes());

  it("gives the accepting BHW the SOS GPS fix", async () => {
    setCaller(CALLER);
    const sos = await incidents.POST(
      jsonRequest("/api/incidents", {
        withProfile: false,
        location: { lat: 14.6507, lng: 121.0494 },
      }),
    );
    const { incidentId } = await sos.json();
    expect(db.locations.get(incidentId)).toEqual({ lat: 14.6507, lng: 121.0494 });

    setCaller(BHW);
    const res = await accept.POST(post(), { params: { id: incidentId } });
    expect((await res.json()).location).toEqual({ lat: 14.6507, lng: 121.0494 });
  });

  it("returns null when the phone shared no location", async () => {
    setCaller(CALLER);
    const { incidentId } = await (
      await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }))
    ).json();
    setCaller(BHW);
    const res = await accept.POST(post(), { params: { id: incidentId } });
    expect((await res.json()).location).toBeNull();
  });

  it("a repeat SOS on the open incident updates its location (and note)", async () => {
    setCaller(CALLER);
    // First SOS: no GPS (e.g. permission prompt not answered yet).
    const { incidentId } = await (
      await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }))
    ).json();
    expect(db.locations.has(incidentId)).toBe(false);

    // Second SOS from the same phone, now with a fix and a note.
    const again = await incidents.POST(
      jsonRequest("/api/incidents", {
        withProfile: false,
        note: "nasa kanto ng Mabini",
        location: { lat: 14.651, lng: 121.05 },
      }),
    );
    expect((await again.json()).incidentId).toBe(incidentId);
    expect(db.locations.get(incidentId)).toEqual({ lat: 14.651, lng: 121.05 });
    expect(db.incidents.get(incidentId)?.note).toBe("nasa kanto ng Mabini");

    // A later SOS without a fix keeps the last known location.
    await incidents.POST(jsonRequest("/api/incidents", { withProfile: false }));
    expect(db.locations.get(incidentId)).toEqual({ lat: 14.651, lng: 121.05 });

    setCaller(BHW);
    const res = await accept.POST(post(), { params: { id: incidentId } });
    expect((await res.json()).location).toEqual({ lat: 14.651, lng: 121.05 });
  });

  it("rejects a location outside the Philippines", async () => {
    setCaller(CALLER);
    const res = await incidents.POST(
      jsonRequest("/api/incidents", { withProfile: false, location: { lat: 51.5, lng: -0.12 } }),
    );
    expect(res.status).toBe(400);
  });
});
