# Data layer

`incidents.ts` holds the server-side Supabase reads/writes for the incident
lifecycle. It respects Row Level Security via the SSR client in
`src/lib/supabase/server.ts`.

The UI screens currently render from `src/lib/mock-data.ts`. To go live:

1. Fill `.env.local` with your Supabase URL, publishable key, and secret key.
2. Run the migrations in `supabase/migrations/` and then `supabase/seed.sql`.
3. Swap the screens from `mockIncident` to these functions (wrap client
   components in a Server Component that fetches, or add Route Handlers).

This is the seam the AI-DLC MVP workflow builds on: the contract
(`src/lib/types.ts`) and the data functions are stable; the workflow wires the
real transitions, escalation timers (pg_cron), and realtime subscriptions.
