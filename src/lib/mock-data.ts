// Mock data for the UI skeleton. No real patient data (FLOW.md security rule).
// This is the Lola Rosa stroke scenario from FLOW.md used as the demo spine.

import type { Incident, ProtocolCard } from "./types";

export const mockIncident: Incident = {
  id: "INC-2026-0001",
  status: "sos",
  unstable: false,
  patient: {
    id: "PAT-001",
    name: "Rosa D. (demo)",
    age: 68,
    sex: "F",
    conditions: ["Hypertension", "Type 2 diabetes"],
    meds: ["Amlodipine", "Metformin"],
    allergies: ["None recorded"],
    address: "14 Mabini St, Barangay San Roque, Quezon City",
    landmark: "Blue gate beside the sari-sari store",
  },
  triage: {
    chiefComplaint: "Sudden one-sided weakness, slurred speech",
    onsetTime: null,
    suspected: "Suspected stroke",
    missingFields: ["onsetTime", "bp", "bloodSugar"],
  },
  hospitals: [
    {
      id: "H1",
      name: "QC General Hospital",
      level: "Level 2",
      capabilities: ["CT", "ICU", "trauma"],
      bedsAvailable: 3,
      isDiverting: false,
      etaSeconds: 11 * 60,
      reason: "Nearest capable: has CT for suspected stroke",
    },
    {
      id: "H2",
      name: "St. Luke's QC",
      level: "Level 3",
      capabilities: ["CT", "ICU", "cath_lab", "trauma"],
      bedsAvailable: 1,
      isDiverting: false,
      etaSeconds: 18 * 60,
      reason: "Higher capability but farther",
    },
    {
      id: "H3",
      name: "Barangay Health Station",
      level: "Level 1",
      capabilities: [],
      bedsAvailable: 0,
      isDiverting: true,
      etaSeconds: 5 * 60,
      reason: "No CT; not suitable for stroke",
    },
  ],
  routes: [
    {
      id: "R1",
      label: "Via Commonwealth Ave",
      etaSeconds: 11 * 60,
      distanceM: 6200,
      traffic: "moderate",
      isSelected: true,
    },
    {
      id: "R2",
      label: "Via Tandang Sora",
      etaSeconds: 13 * 60,
      distanceM: 5800,
      traffic: "light",
      isSelected: false,
    },
    {
      id: "R3",
      label: "Via Luzon Ave",
      etaSeconds: 16 * 60,
      distanceM: 7100,
      traffic: "heavy",
      isSelected: false,
    },
  ],
  timeline: [
    { type: "SOS raised", actor: "Household", at: "2026-10-04T09:12:00+08:00" },
  ],
};

export const protocolCards: Record<string, ProtocolCard> = {
  stroke: {
    condition: "Suspected stroke",
    steps: [
      "Note the exact time symptoms started (critical for treatment window).",
      "Lay the person on their side if they vomit.",
      "Keep them calm and still; loosen tight clothing.",
      "Stay on the call and relay changes.",
    ],
    doNot: [
      "Do NOT give food, drink, or medicine.",
      "Do NOT leave the person alone.",
    ],
    reviewed: false, // Open item in FLOW.md: clinician review pending
  },
  cardiac_arrest: {
    condition: "Cardiac arrest / not breathing",
    steps: [
      "Confirm immediately and start CPR coaching. No questions first.",
      "Push hard and fast in the center of the chest, 100-120/min.",
      "Continue until the ambulance arrives or the person responds.",
    ],
    doNot: ["Do NOT stop compressions to check repeatedly."],
    reviewed: false,
  },
};
