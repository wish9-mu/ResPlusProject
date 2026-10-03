import { describe, expect, it } from "vitest";
import {
  CALL_UIDS,
  channelForIncident,
  isIncidentId,
  speakerForUid,
  uidForRole,
} from "@/lib/agora/channel";

const ID = "3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c";

describe("channelForIncident", () => {
  it("builds incident_<uuid>", () => {
    expect(channelForIncident(ID)).toBe(`incident_${ID}`);
  });

  it("normalises the uuid to lower case so both sides land in one channel", () => {
    expect(channelForIncident(ID.toUpperCase())).toBe(`incident_${ID}`);
  });

  it("contains nothing but the prefix and the uuid (no PII)", () => {
    const channel = channelForIncident(ID);
    expect(channel).toMatch(/^incident_[0-9a-f-]{36}$/);
    // Agora channel names are limited to 64 bytes.
    expect(channel.length).toBeLessThanOrEqual(64);
  });

  it.each([
    "",
    "not-a-uuid",
    "Lola Rosa",
    "+639171234567",
    `${ID} ; drop table incidents`,
    "../incident",
  ])("rejects non-uuid input %j", (bad) => {
    expect(isIncidentId(bad)).toBe(false);
    expect(() => channelForIncident(bad)).toThrow();
  });
});

describe("uids and speakers", () => {
  it("gives each role a distinct fixed uid", () => {
    expect(uidForRole("household")).toBe(CALL_UIDS.household);
    expect(uidForRole("bhw")).toBe(CALL_UIDS.bhw);
    expect(new Set(Object.values(CALL_UIDS)).size).toBe(3);
  });

  it("maps uids back to speaker labels", () => {
    expect(speakerForUid(CALL_UIDS.household)).toBe("household");
    expect(speakerForUid(CALL_UIDS.bhw)).toBe("bhw");
    expect(speakerForUid(CALL_UIDS.stt)).toBe("unknown");
    expect(speakerForUid(12345)).toBe("unknown");
  });
});
