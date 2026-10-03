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
