// Minimal hand-written Database types for the Res+ schema. Replace with
// generated types once you run:
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts

export type IncidentStatusDb =
  | "sos"
  | "confirmed"
  | "bhw_on_scene"
  | "ambulance_on_scene"
  | "transporting"
  | "arrived"
  | "closed";

export type RoleDb = "household" | "bhw" | "ambulance" | "er";

interface IncidentRow {
  id: string;
  patient_id: string | null;
  status: IncidentStatusDb;
  assigned_bhw: string | null;
  assigned_ambulance: string | null;
  assigned_hospital: string | null;
  triage: Record<string, unknown>;
  missing_fields: string[];
  unstable: boolean;
  escalation_deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface PatientRow {
  id: string;
  household_id: string | null;
  name: string;
  age: number | null;
  sex: "F" | "M" | null;
  conditions: string[];
  meds: string[];
  allergies: string[];
  address: string | null;
  landmark: string | null;
}

interface HospitalRow {
  id: string;
  name: string;
  level: string | null;
  capabilities: string[];
  beds_available: number;
  is_diverting: boolean;
  updated_at: string;
}

interface IncidentEventRow {
  id: string;
  incident_id: string;
  actor_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface ProfileRow {
  id: string;
  role: RoleDb;
  name: string;
  phone: string | null;
  on_duty: boolean;
  hospital_id: string | null;
  created_at: string;
}

export interface Database {
  // supabase-js 2.x reads this marker for typed-client inference. Without it,
  // write payloads (.insert/.update) collapse to `never`.
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      incidents: {
        Row: IncidentRow;
        Insert: Partial<IncidentRow>;
        Update: Partial<IncidentRow>;
        Relationships: [];
      };
      patients: {
        Row: PatientRow;
        Insert: Partial<PatientRow>;
        Update: Partial<PatientRow>;
        Relationships: [];
      };
      hospitals: {
        Row: HospitalRow;
        Insert: Partial<HospitalRow>;
        Update: Partial<HospitalRow>;
        Relationships: [];
      };
      incident_events: {
        Row: IncidentEventRow;
        Insert: Partial<IncidentEventRow>;
        Update: Partial<IncidentEventRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    // Empty object (not Record<string, never>): an empty map trivially
    // satisfies postgrest-js's Record<string, GenericView/GenericFunction>
    // constraint, whereas `never` values violate it and collapse writes.
    Views: {};
    Functions: {};
    Enums: {
      app_role: RoleDb;
      incident_status: IncidentStatusDb;
    };
    CompositeTypes: {};
  };
}
