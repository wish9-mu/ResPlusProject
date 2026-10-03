-- Res+ live call + transcription support.
-- Safe to re-run. Run as the `postgres` role in the SQL editor.

-- Who raised the SOS. Households sign in anonymously when they tap SOS, so
-- even unregistered callers have an identity the call token can be tied to.
alter table incidents
  add column if not exists reporter_id uuid references profiles (id) on delete set null;
-- Free-text note from the quick (unregistered) SOS path.
alter table incidents
  add column if not exists note text check (char_length(note) <= 500);

create index if not exists idx_incidents_reporter on incidents (reporter_id);

-- The reporter can see their own incident (e.g. status updates).
drop policy if exists incidents_reporter_read on incidents;
create policy incidents_reporter_read on incidents
  for select using (reporter_id = auth.uid());

-- Idempotency key for transcript segments: "<uid>:<sentenceId>:<offset>".
-- Lets a retried save never create a duplicate line.
alter table transcript_segments
  add column if not exists source_key text;
create unique index if not exists uq_transcript_segments_source_key
  on transcript_segments (source_key);
create index if not exists idx_transcript_segments_incident
  on transcript_segments (incident_id, created_at);

-- Supabase Realtime: push inserts/updates to the dashboards. Realtime still
-- applies each table's RLS, so users only receive rows they can select.
do $$
declare t text;
begin
  foreach t in array array['incidents', 'incident_events', 'transcript_segments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
