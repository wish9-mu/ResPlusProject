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
