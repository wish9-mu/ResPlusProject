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

-- Crew accounts are NOT seeded here: this repo is public, so real crew emails
-- live only in the database. To add crew, run in the SQL editor (role: postgres):
--
--   insert into crew_allowlist (email, role, name, hospital_name) values
--     ('someone@example.com', 'bhw', 'Name', null)
--   on conflict (email) do update
--     set role = excluded.role, name = excluded.name, hospital_name = excluded.hospital_name;
--   select public.sync_crew_roles();
--
-- role: 'bhw' | 'ambulance' | 'er'. hospital_name is for ER staff only and
-- must match hospitals.name exactly.

-- Real Metro Manila hospitals for nearest-hospital suggestions. Coordinates
-- come from TomTom Search (POI lookup). Capabilities and bed counts are NOT
-- known yet, so they are left empty for ER staff to fill in; the UI says so.
insert into hospitals (name, location, level, capabilities, beds_available, is_diverting)
values
  ('St. Luke''s Medical Center - Global City', st_point(121.047623, 14.555113)::geography, null, array[]::text[], 0, false),
  ('Ospital ng Makati',                        st_point(121.061587, 14.546268)::geography, null, array[]::text[], 0, false),
  ('Makati Medical Center',                    st_point(121.014168, 14.558944)::geography, null, array[]::text[], 0, false),
  ('Taguig-Pateros District Hospital',         st_point(121.033984, 14.510637)::geography, null, array[]::text[], 0, false),
  ('Rizal Medical Center',                     st_point(121.065734, 14.56479)::geography,  null, array[]::text[], 0, false),
  ('Philippine General Hospital',              st_point(120.98621, 14.577931)::geography,  null, array[]::text[], 0, false),
  ('Cardinal Santos Medical Center',           st_point(121.045425, 14.59783)::geography,  null, array[]::text[], 0, false)
on conflict (name) do nothing;
