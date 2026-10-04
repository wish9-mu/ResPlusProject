import { z } from "zod";

// Shared, clinician-neutral facts only. This card records observations and
// patient details; it never generates medical advice.
const text = (max: number) => z.string().trim().max(max).default("");

export const incidentTriageSchema = z
  .object({
    patientName: text(120),
    age: z.number().int().min(0).max(130).nullable().default(null),
    chiefComplaint: text(500),
    suspectedCondition: text(160),
    onsetTime: text(120), // allows "10 minutes ago" when exact time is unknown
    bloodPressure: text(40),
    bloodSugar: text(40),
    exactLocation: text(300),
    conditionsAndMeds: text(600),
    allergies: text(300),
    notes: text(2000),
  })
  .strict();

export type IncidentTriage = z.infer<typeof incidentTriageSchema>;

export const EMPTY_TRIAGE: IncidentTriage = incidentTriageSchema.parse({});

export const triageUpdateSchema = z
  .object({
    triage: incidentTriageSchema,
    unstable: z.boolean(),
  })
  .strict();

// The handoff minimum. Vitals remain optional because equipment may not be
// available; the UI still shows them as fields without claiming they exist.
const REQUIRED: Array<[keyof IncidentTriage, string]> = [
  ["patientName", "patient name"],
  ["age", "age"],
  ["chiefComplaint", "what happened"],
  ["onsetTime", "onset time"],
  ["exactLocation", "exact location"],
  ["conditionsAndMeds", "conditions & meds"],
];

export function deriveMissingFields(triage: IncidentTriage): string[] {
  return REQUIRED.filter(([key]) => {
    const value = triage[key];
    return value === null || (typeof value === "string" && value.trim() === "");
  }).map(([, label]) => label);
}

// Existing incidents may contain `{}` or old camelCase keys. Normalize only
// recognized values, then let the strict schema apply defaults and limits.
export function normalizeTriage(value: unknown): IncidentTriage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_TRIAGE };
  }
  const source = value as Record<string, unknown>;
  const candidate = {
    patientName: source.patientName,
    age: source.age,
    chiefComplaint: source.chiefComplaint,
    suspectedCondition: source.suspectedCondition ?? source.suspected,
    onsetTime: source.onsetTime,
    bloodPressure: source.bloodPressure ?? source.bp,
    bloodSugar: source.bloodSugar,
    exactLocation: source.exactLocation,
    conditionsAndMeds: source.conditionsAndMeds,
    allergies: source.allergies,
    notes: source.notes,
  };
  const parsed = incidentTriageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : { ...EMPTY_TRIAGE };
}
