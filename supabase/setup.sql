-- Res+ one-shot setup. Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Generated from migrations/0001-0003 + seed.sql. Safe to re-run.

-- ===== migrations\0001_init.sql =====
-- Res+ initial schema. Mirrors TECH_STACK.md data model and FLOW.md statuses.
-- Run via supabase/setup.sql in the Supabase SQL editor.

-- Extensions. PostGIS goes in the `extensions` schema (Supabase convention).
-- pg_cron is added later with the escalation-timer work.
create extension if not exists postgis with schema extensions;

-- Enums (app_role avoids clashing with the SQL keyword ROLE)
do $$ begin
  create type app_role as enum ('household', 'bhw', 'ambulance', 'er');
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

-- hospitals (created first so profiles can reference it)
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location geography(point, 4326),
  level text,
  capabilities text[] not null default '{}',
  beds_available int not null default 0,
  is_diverting boolean not null default false,
  updated_at timestamptz not null default now()
);

-- profiles: one row per auth user. Created by the on_auth_user_created trigger.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'household',
  name text not null,
  phone text,
  on_duty boolean not null default false,
  location geography(point, 4326),
  hospital_id uuid references hospitals (id) on delete set null, -- ER staff
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

-- ambulances
create table if not exists ambulances (
  id uuid primary key default gen_random_uuid(),
  unit_name text not null unique,
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
  who app_role not null,
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

-- Indexes
create index if not exists idx_incidents_status on incidents (status);
create index if not exists idx_incident_events_incident on incident_events (incident_id, created_at);
create index if not exists idx_hospitals_location on hospitals using gist (location);
create index if not exists idx_profiles_location on profiles using gist (location);


-- ===== migrations\0002_rls.sql =====
-- Row Level Security for Res+. Per TECH_STACK.md: RLS on every table.
-- Hackathon-grade starting policies - tighten before any real deployment.

alter table profiles enable row level security;
alter table patients enable row level security;
alter table hospitals enable row level security;
alter table ambulances enable row level security;
alter table incidents enable row level security;
alter table transcript_segments enable row level security;
alter table location_pings enable row level security;
alter table routes enable row level security;
alter table incident_events enable row level security;

-- Current user's role. SECURITY DEFINER so it reads profiles without
-- re-entering profiles' own RLS policies (which would recurse forever).
create or replace function public.current_role_name()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles: users read their own row; staff read peers.
drop policy if exists profiles_self on profiles;
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_staff_read on profiles;
create policy profiles_staff_read on profiles
  for select using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

-- Privilege-escalation guard: users may only edit harmless columns of their
-- own profile. role and hospital_id are set by the trigger / service role only.
revoke insert, update, delete on profiles from anon, authenticated;
grant update (name, phone, on_duty, location) on profiles to authenticated;

-- hospitals: readable by signed-in users; ER updates its own hospital.
drop policy if exists hospitals_read on hospitals;
create policy hospitals_read on hospitals
  for select using (auth.role() = 'authenticated');

drop policy if exists hospitals_er_update on hospitals;
create policy hospitals_er_update on hospitals
  for update using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'er' and p.hospital_id = hospitals.id
    )
  );

-- ambulances: staff can read.
drop policy if exists ambulances_staff_read on ambulances;
create policy ambulances_staff_read on ambulances
  for select using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

-- patients: household manages its own; staff can read.
drop policy if exists patients_household on patients;
create policy patients_household on patients
  for all using (household_id = auth.uid()) with check (household_id = auth.uid());

drop policy if exists patients_staff_read on patients;
create policy patients_staff_read on patients
  for select using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

-- incidents: household sees incidents for its patients; field staff see all;
-- ER sees incidents routed to its hospital.
drop policy if exists incidents_household on incidents;
create policy incidents_household on incidents
  for select using (
    exists (
      select 1 from patients pt
      where pt.id = incidents.patient_id and pt.household_id = auth.uid()
    )
  );

drop policy if exists incidents_assigned_staff on incidents;
create policy incidents_assigned_staff on incidents
  for all using (
    public.current_role_name() in ('bhw', 'ambulance')
    or assigned_hospital in (
      select p.hospital_id from profiles p where p.id = auth.uid() and p.role = 'er'
    )
  );

-- child tables: staff only (role-scoped, not per-incident).
drop policy if exists child_staff_all on transcript_segments;
create policy child_staff_all on transcript_segments
  for all using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists child_staff_all on location_pings;
create policy child_staff_all on location_pings
  for all using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists child_staff_all on routes;
create policy child_staff_all on routes
  for all using (public.current_role_name() in ('bhw', 'ambulance', 'er'));

-- incident_events: append + read for staff; no updates or deletes.
drop policy if exists events_staff_insert on incident_events;
create policy events_staff_insert on incident_events
  for insert with check (public.current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists events_read on incident_events;
create policy events_read on incident_events
  for select using (public.current_role_name() in ('bhw', 'ambulance', 'er'));


-- ===== migrations\0003_crew_auth.sql =====
-- Verified emergency-crew emails. Only emails listed here get a crew role
-- (bhw / ambulance / er) when they sign up. Everyone else becomes a household.
-- No RLS policies: only the service role / SQL editor can read or edit it.
create table if not exists crew_allowlist (
  email text primary key,
  role app_role not null check (role <> 'household'),
  name text not null,
  hospital_name text, -- ER staff: must match hospitals.name
  created_at timestamptz not null default now()
);
alter table crew_allowlist enable row level security;

-- Create a profile for every new auth user, with the role from the allowlist.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.crew_allowlist%rowtype;
begin
  select * into a from public.crew_allowlist where lower(email) = lower(new.email);

  insert into public.profiles (id, role, name, phone, hospital_id)
  values (
    new.id,
    coalesce(a.role, 'household'),
    coalesce(a.name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User'),
    new.phone,
    (select h.id from public.hospitals h where h.name = a.hospital_name limit 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Re-apply the allowlist to users who already exist (e.g. an email was added
-- to the allowlist after that person signed up). Safe to run any time.
create or replace function public.sync_crew_roles()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles p
  set role = a.role,
      name = a.name,
      hospital_id = (select h.id from public.hospitals h where h.name = a.hospital_name limit 1)
  from auth.users u
  join public.crew_allowlist a on lower(a.email) = lower(u.email)
  where p.id = u.id;
$$;
revoke execute on function public.sync_crew_roles() from public, anon, authenticated;


-- ===== seed.sql =====
-- Res+ demo seed. NO real patient data (TECH_STACK.md security rule).
-- Safe to re-run: every insert skips rows that already exist.

insert into hospitals (name, location, level, capabilities, beds_available, is_diverting)
values
  ('QC General Hospital', st_point(121.043, 14.676)::geography, 'Level 2',
    array['CT','ICU','trauma'], 3, false),
  ('St. Luke''s QC', st_point(121.028, 14.624)::geography, 'Level 3',
    array['CT','ICU','cath_lab','trauma'], 1, false),
  ('Barangay Health Station', st_point(121.050, 14.680)::geography, 'Level 1',
    array[]::text[], 0, true)
on conflict (name) do nothing;

insert into ambulances (unit_name, lgu, location, status)
values ('QC-Rescue-01', 'Quezon City', st_point(121.045, 14.678)::geography, 'available')
on conflict (unit_name) do nothing;

-- Demo patient uses a synthetic name only.
insert into patients (name, age, sex, conditions, meds, allergies, address, landmark)
select
  'Rosa D. (demo)', 68, 'F',
  array['Hypertension','Type 2 diabetes'],
  array['Amlodipine','Metformin'],
  array['None recorded'],
  '14 Mabini St, Barangay San Roque, Quezon City',
  'Blue gate beside the sari-sari store'
where not exists (select 1 from patients where name = 'Rosa D. (demo)');

-- Demo crew. Replace or add your real crew emails here; anyone not listed
-- signs in as a household and is turned away from the crew dashboards.
insert into crew_allowlist (email, role, name, hospital_name) values
  ('bhw@resplus.demo',       'bhw',       'Demo BHW',            null),
  ('ambulance@resplus.demo', 'ambulance', 'Demo Ambulance Crew', null),
  ('er@resplus.demo',        'er',        'Demo ER Staff',       'QC General Hospital')
on conflict (email) do update
  set role = excluded.role, name = excluded.name, hospital_name = excluded.hospital_name;

select public.sync_crew_roles();

