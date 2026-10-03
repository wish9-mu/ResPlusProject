-- Res+ demo seed. NO real patient data (TECH_STACK.md security rule).
-- Run after the migrations. Hospitals/ambulance are reference data; the demo
-- incident mirrors the Lola Rosa stroke scenario in FLOW.md.

insert into hospitals (name, location, level, capabilities, beds_available, is_diverting)
values
  ('QC General Hospital', st_point(121.043, 14.676)::geography, 'Level 2',
    array['CT','ICU','trauma'], 3, false),
  ('St. Luke''s QC', st_point(121.028, 14.624)::geography, 'Level 3',
    array['CT','ICU','cath_lab','trauma'], 1, false),
  ('Barangay Health Station', st_point(121.050, 14.680)::geography, 'Level 1',
    array[]::text[], 0, true)
on conflict do nothing;

insert into ambulances (unit_name, lgu, location, status)
values ('QC-Rescue-01', 'Quezon City', st_point(121.045, 14.678)::geography, 'available')
on conflict do nothing;

-- Demo patient uses a synthetic name only.
insert into patients (name, age, sex, conditions, meds, allergies, address, landmark)
values (
  'Rosa D. (demo)', 68, 'F',
  array['Hypertension','Type 2 diabetes'],
  array['Amlodipine','Metformin'],
  array['None recorded'],
  '14 Mabini St, Barangay San Roque, Quezon City',
  'Blue gate beside the sari-sari store'
)
on conflict do nothing;
