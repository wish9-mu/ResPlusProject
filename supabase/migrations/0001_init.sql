-- Res+ initial schema. Mirrors TECH_STACK.md data model and FLOW.md statuses.
-- Run in the Supabase SQL editor, or via the Supabase CLI.

-- Extensions
create extension if not exists postgis;
create extension if not exists pg_cron;

-- Enums
do $$ begin
  create type role as enum ('household', 'bhw', 'ambulance', 'er');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_status as enum (
    'sos', 'confirmed', 'bhw_on_scene', 'ambulance_on_scene',
    'transporting', 'arrived', 'closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ambulance_status as enum (
    'available', 'standby', 'dispatched', 'transporting'
  );
exception when duplicate_object then null; end $$;

-- profiles: one row per user (linked to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role role not null,
  name text not null,
  phone text,
  on_duty boolean not null default false,
  location geography(point, 4326),
  hospital_id uuid, -- set for ER staff; FK added after hospitals exists
  created_at timestamptz not null default now()
);

-- patients: enrolled high-risk individuals
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references profiles (id) on delete set null,
  name text not null,
  age int,
  sex text check (sex in ('F', 'M')),
  conditions text[] not null default '{}',
  meds text[] not null default '{}',
  allergies text[] not null default '{}',
  address text,
  landmark text,
  enrolled_by uuid references profiles (id),
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

-- hospitals
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location geography(point, 4326),
  level text,
  capabilities text[] not null default '{}',
  beds_available int not null default 0,
  is_diverting boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table profiles
  drop constraint if exists profiles_hospital_id_fkey,
  add constraint profiles_hospital_id_fkey
    foreign key (hospital_id) references hospitals (id) on delete set null;

-- ambulances
create table if not exists ambulances (
  id uuid primary key default gen_random_uuid(),
  unit_name text not null,
  lgu text,
  crew_ids uuid[] not null default '{}',
  location geography(point, 4326),
  status ambulance_status not null default 'available'
);

-- incidents: the live record
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete set null,
  status incident_status not null default 'sos',
  location geography(point, 4326),
  assigned_bhw uuid references profiles (id),
  assigned_ambulance uuid references ambulances (id),
  assigned_hospital uuid references hospitals (id),
  triage jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  unstable boolean not null default false,
  escalation_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  speaker text,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists location_pings (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  who role not null,
  location geography(point, 4326) not null,
  recorded_at timestamptz not null default now()
);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  polyline text,
  eta_seconds int,
  distance_m int,
  is_selected boolean not null default false,
  computed_at timestamptz not null default now()
);

-- incident_events: full timeline / audit log
create table if not exists incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  actor_id uuid references profiles (id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_incidents_status on incidents (status);
create index if not exists idx_incident_events_incident on incident_events (incident_id, created_at);
create index if not exists idx_hospitals_location on hospitals using gist (location);
create index if not exists idx_profiles_location on profiles using gist (location);
