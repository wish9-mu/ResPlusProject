// Shared domain types for Res+. These mirror FLOW.md and TECH_STACK.md so the
// AI-DLC MVP workflow can build logic onto a stable contract.

export type Role = "household" | "bhw" | "ambulance" | "er";

// FLOW.md statuses: sos -> confirmed -> bhw_on_scene ->
// ambulance_on_scene -> transporting -> arrived -> closed
export type IncidentStatus =
  | "sos"
  | "confirmed"
  | "bhw_on_scene"
  | "ambulance_on_scene"
  | "transporting"
  | "arrived"
  | "closed";

export const STATUS_ORDER: IncidentStatus[] = [
  "sos",
  "confirmed",
  "bhw_on_scene",
  "ambulance_on_scene",
  "transporting",
  "arrived",
  "closed",
];

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  sos: "SOS raised",
  confirmed: "Emergency confirmed",
  bhw_on_scene: "BHW on scene",
  ambulance_on_scene: "Ambulance on scene",
  transporting: "Transporting",
  arrived: "Arrived at ER",
  closed: "Closed",
};

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: "F" | "M";
  conditions: string[];
  meds: string[];
  allergies: string[];
  address: string;
  landmark: string;
}

export interface TriageCard {
  chiefComplaint: string;
  onsetTime: string | null;
  suspected: string;
  // Fields the AI/BHW still needs to fill. Drives the "missing info" prompts.
  missingFields: string[];
  bp?: string;
  bloodSugar?: string;
}

export interface Hospital {
  id: string;
  name: string;
  level: string;
  capabilities: string[]; // CT, ICU, cath_lab, pedia, OB, trauma
  bedsAvailable: number;
  isDiverting: boolean;
  etaSeconds: number;
  reason: string;
}

export interface RouteOption {
  id: string;
  label: string;
  etaSeconds: number;
  distanceM: number;
  traffic: "light" | "moderate" | "heavy";
  isSelected: boolean;
}

export interface IncidentEvent {
  type: string;
  actor: string;
  at: string; // ISO time
}

export interface Incident {
  id: string;
  status: IncidentStatus;
  patient: Patient;
  unstable: boolean;
  triage: TriageCard;
  hospitals: Hospital[];
  routes: RouteOption[];
  timeline: IncidentEvent[];
}

export interface ProtocolCard {
  condition: string;
  steps: string[];
  doNot: string[];
  reviewed: boolean; // clinician-reviewed, per FLOW.md safety rule #3
}
