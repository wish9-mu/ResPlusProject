-- Row Level Security for Res+. Per TECH_STACK.md: RLS on every table.
-- Households see only their own patients/incidents; ER sees only incidents
-- assigned to its hospital. These are hackathon-grade starting policies -
-- tighten before any real deployment.

alter table profiles enable row level security;
alter table patients enable row level security;
alter table hospitals enable row level security;
alter table ambulances enable row level security;
alter table incidents enable row level security;
alter table transcript_segments enable row level security;
alter table location_pings enable row level security;
alter table routes enable row level security;
alter table incident_events enable row level security;

-- Helper: current user's role
create or replace function current_role_name()
returns role
language sql stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- profiles: a user can read/update their own row; staff can read peers
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_staff_read on profiles;
create policy profiles_staff_read on profiles
  for select using (current_role_name() in ('bhw', 'ambulance', 'er'));

-- hospitals: readable by any authenticated user; ER updates its own hospital
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

-- patients: household sees its own; staff (bhw/ambulance/er) can read
drop policy if exists patients_household on patients;
create policy patients_household on patients
  for all using (household_id = auth.uid()) with check (household_id = auth.uid());

drop policy if exists patients_staff_read on patients;
create policy patients_staff_read on patients
  for select using (current_role_name() in ('bhw', 'ambulance', 'er'));

-- incidents: household sees incidents for its patients; assigned staff see
-- theirs; ER sees incidents routed to its hospital
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
    assigned_bhw = auth.uid()
    or assigned_ambulance in (
      select a.id from ambulances a where auth.uid() = any (a.crew_ids)
    )
    or assigned_hospital in (
      select p.hospital_id from profiles p where p.id = auth.uid() and p.role = 'er'
    )
    or current_role_name() in ('bhw', 'ambulance')
  );

-- child tables: readable/writable by any staff tied to the parent incident.
-- Hackathon-grade: scoped by role rather than full per-incident joins.
drop policy if exists child_staff_all on transcript_segments;
create policy child_staff_all on transcript_segments
  for all using (current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists child_staff_all on location_pings;
create policy child_staff_all on location_pings
  for all using (current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists child_staff_all on routes;
create policy child_staff_all on routes
  for all using (current_role_name() in ('bhw', 'ambulance', 'er'));

-- incident_events: staff can append and read; nobody updates/deletes
drop policy if exists events_staff_insert on incident_events;
create policy events_staff_insert on incident_events
  for insert with check (current_role_name() in ('bhw', 'ambulance', 'er'));

drop policy if exists events_read on incident_events;
create policy events_read on incident_events
  for select using (current_role_name() in ('bhw', 'ambulance', 'er'));
