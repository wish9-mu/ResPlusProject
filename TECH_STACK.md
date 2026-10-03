# Res+ Tech Stack

Built around the flow in [FLOW.md](./FLOW.md).

## Overview

| Layer | Tool | Why |
|---|---|---|
| App (frontend + API) | **Next.js (App Router) + TypeScript** | One codebase for all 4 roles, API routes for server-side keys |
| UI | **Tailwind CSS + shadcn/ui** | Fast, accessible components |
| Installable app | **PWA** (manifest + service worker) | Works like an app on phones, no app store |
| Database | **Supabase Postgres + PostGIS** | PostGIS finds the nearest BHW, ambulance, and hospital |
| Login | **Supabase Auth** | Email login for staff, phone OTP for households |
| Live updates | **Supabase Realtime** | ER, BHW, and crew screens update instantly |
| Timers / escalation | **Supabase pg_cron + database functions** | Runs the 30s / 60s / 2-min escalations server-side, even if a phone closes the app |
| Live call | **Agora RTC Web SDK** | Real-time two-way call (and push-to-talk mode) |
| Silent transcription | **Agora Real-Time STT** | Transcribes the call in the background |
| Transcript fallback | **Web Speech API** (`fil-PH`) or typed notes | Keeps triage working if STT fails |
| AI triage | **Amazon Bedrock (Claude)** + **zod** | Turns the transcript into a structured triage card + missing fields |
| Map + traffic heat map | **Google Maps JavaScript API** (TrafficLayer) | Live traffic colors on the map |
| Routes + ETAs | **Google Routes API** | Alternate routes with traffic-aware ETAs, hospital ranking |
| Turn-by-turn | **Google Maps / Waze deep links** | Crews use navigation they already trust |
| Protocol cards | **Versioned JSON in the repo** | Fixed, clinician-reviewed content. AI never writes medical advice. |
| Tests | **Vitest + Testing Library**, **Playwright** (e2e) | Unit tests + one full SOS-to-arrival test |
| Hosting | **Vercel** | Public URL for judges |
| Code | **GitHub (public repo)** | Judges verify features |

## Flow step → tech

| Step | What happens | Tech |
|---|---|---|
| 0. Enrollment | BHW registers patient, family verifies phone | Supabase Auth (phone OTP), `patients` table, consent record |
| 1. SOS | One tap → GPS + profile, call rings BHW, ambulance on standby | Browser Geolocation, PostGIS nearest query, Agora channel, Realtime alert |
| 2. BHW confirms | Live call, Confirm emergency → dispatch | Agora RTC, Agora STT starts, status → `confirmed` |
| 3. Coaching | BHW reads protocol card on the call | Protocol JSON, chosen by condition |
| 4. BHW on scene | Vitals, first aid, missing fields | Supabase updates → Realtime |
| 5. Ambulance on scene | Hospital recommendation + reason, Unstable toggle | Routes API `computeRouteMatrix` + capability/bed filter |
| 6. ER confirms/diverts | Accept, divert, 2-min auto-escalate | Realtime + pg_cron escalation |
| 7. En route | Traffic heat map, 2–3 routes with ETAs, reroute suggestion | Maps JS TrafficLayer, Routes API `computeRoutes` (alternatives), GPS pings |
| 8. Arrival | Handoff, timeline closes | `incident_events` audit log |
| Always | Call 911, tap-to-call fallback | `tel:911`, `tel:<bhw_phone>` links |

## Data model (Supabase)

| Table | Key fields |
|---|---|
| `profiles` | user id, role (`household`, `bhw`, `ambulance`, `er`), name, phone, on_duty, location |
| `patients` | household_id, name, age, sex, conditions[], meds[], allergies[], address, landmark, enrolled_by, consent_at |
| `hospitals` | name, location, level, capabilities[] (CT, ICU, cath_lab, pedia, OB, trauma), beds_available, is_diverting, updated_at |
| `ambulances` | unit name, LGU, crew ids, location, status (available, standby, dispatched, transporting) |
| `incidents` | patient_id, status, location, assigned bhw/ambulance/hospital, triage jsonb, missing_fields[], unstable, escalation_deadline |
| `transcript_segments` | incident_id, speaker, text, created_at |
| `location_pings` | incident_id, who, lat, lng, recorded_at |
| `routes` | incident_id, polyline, eta_seconds, distance_m, is_selected, computed_at |
| `incident_events` | incident_id, actor_id, type, payload, created_at (full timeline / audit log) |

Statuses: `sos → confirmed → bhw_on_scene → ambulance_on_scene → transporting → arrived → closed`

## APIs and accounts

| Service | What to enable | Keys you get |
|---|---|---|
| **Supabase** | New project (Singapore region), PostGIS + pg_cron extensions, Phone auth | Project URL, anon key, service_role key |
| **Agora** | Project in Secure mode (App ID + Token), Real-Time STT, RESTful API credentials | App ID, App Certificate, Customer ID, Customer Secret |
| **AWS Bedrock** | Model access for Claude, IAM user with `bedrock:InvokeModel` only | Access key ID, secret, region, model ID |
| **Google Cloud** | Billing on, Maps JavaScript API, Routes API, budget alert | Browser key (referrer-restricted), server key (Routes only) |
| **SMS for OTP** | Twilio (or other provider) connected to Supabase Phone auth | Provider credentials (set inside Supabase, not in the app) |
| **Vercel** | Import GitHub repo, add env vars | — |

For the demo, use Supabase test phone numbers with fixed OTP codes so you don't depend on SMS delivery.

## `.env.example`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only

# Agora
NEXT_PUBLIC_AGORA_APP_ID=
AGORA_APP_CERTIFICATE=            # server only (token generation)
AGORA_CUSTOMER_ID=                # server only (STT REST API)
AGORA_CUSTOMER_SECRET=            # server only

# AWS Bedrock
AWS_ACCESS_KEY_ID=                # server only
AWS_SECRET_ACCESS_KEY=            # server only
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=

# Google
NEXT_PUBLIC_GOOGLE_MAPS_KEY=      # browser key, referrer-restricted
GOOGLE_ROUTES_KEY=                # server only
```

## Security rules
- Only `NEXT_PUBLIC_*` values reach the browser. Everything else stays in API routes.
- `.env.local` is gitignored from the first commit. Only `.env.example` is committed.
- Agora tokens are generated server-side per incident channel and expire.
- Row Level Security on every table: households see only their own patients/incidents, ER sees only incidents assigned to its hospital.
- Validate every API input with zod. Log every state change to `incident_events`.
- Consent recorded at enrollment. Minimum patient data. No real patient data in seeds.
- Rotate or delete AWS and Google keys after the hackathon.

## Reliability rules
- External calls (Bedrock, Routes, Agora) have timeouts, retries, and fallbacks.
- Routes API results are cached; recomputed at most once per minute per incident.
- AI failure never blocks dispatch. The BHW can always type or tap the triage manually.
- Escalation timers run in the database (pg_cron), not in a phone's browser.

## Known limits (be honest in the pitch)
- **Alerts when the app is closed:** in-app Realtime alerts with sound work while the app is open. Background alerts need Web Push; on iPhone this only works when the PWA is installed to the home screen. Keep staff screens open during the demo.
- **Hospital beds:** there is no public live bed API in PH. ER staff update beds in Res+; seed values are only the starting state.
- **Agora STT Taglish accuracy:** not yet verified. Test it in the first hour; the fallback covers it.
- **pg_cron sub-minute schedules:** confirm your Supabase project supports second-level intervals (e.g., every 10 seconds). If not, use a 1-minute job plus client-side countdowns that call a server endpoint.

## Setup order (hour 0)
1. Request Bedrock model access (can take time)
2. Google Cloud billing + both keys + budget alert
3. Agora project + STT + REST credentials
4. Supabase project + PostGIS + pg_cron + phone auth test numbers
5. GitHub repo + Vercel project + env vars
