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

// WGS84 coordinates in {lat, lng} order (Leaflet/TomTom order). PostGIS stores
// the same point as st_point(lng, lat), so swap carefully at the DB boundary.
export interface LatLng {
  lat: number;
  lng: number;
}

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
  location: LatLng;
  level: string;
  capabilities: string[]; // CT, ICU, cath_lab, pedia, OB, trauma
  bedsAvailable: number;
  isDiverting: boolean;
  etaSeconds: number;
  reason: string;
}

// "unknown" is used when live routing is unavailable (straight-line estimate).
export type TrafficLevel = "light" | "moderate" | "heavy" | "unknown";

export interface RouteOption {
  id: string;
  label: string;
  etaSeconds: number;
  distanceM: number;
  traffic: TrafficLevel;
  // Extra seconds from live traffic incidents (jams, closures) on this route.
  trafficDelaySeconds: number;
  isSelected: boolean;
  // Road geometry for drawing the route on the map.
  path: LatLng[];
  // true when live routing failed and this is a rough straight-line estimate.
  estimated?: boolean;
}

export interface Ambulance {
  id: string;
  unitName: string;
  // Last known position. Live GPS pings come later; the seed base for now.
  location: LatLng | null;
}

// A person responding on foot or by motorbike, e.g. the assigned BHW.
export interface Responder {
  id: string;
  name: string;
  // Last known position. Live GPS pings come later; a demo value for now.
  location: LatLng | null;
}

export interface IncidentEvent {
  type: string;
  actor: string;
  at: string; // ISO time
}

export interface Incident {
  id: string;
  status: IncidentStatus;
  // SOS GPS fix, i.e. the scene. null when the phone couldn't get a fix
  // (FLOW.md "Bad GPS": fall back to home address + landmark).
  location: LatLng | null;
  patient: Patient;
  // Assigned ambulance unit, once dispatched.
  ambulance: Ambulance | null;
  // BHW who confirmed the emergency and is heading to (or at) the scene.
  bhw: Responder | null;
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
