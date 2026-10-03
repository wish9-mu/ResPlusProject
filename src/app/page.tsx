"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { TopBar } from "@/components/top-bar";
import { mockIncident } from "@/lib/mock-data";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// The landing page IS the household experience (FLOW.md: never a dead end).
// Two entry paths:
//   - registered: enrolled patient, SOS carries full identity.
//   - unregistered: fast SOS for a bystander or un-enrolled person; sends
//     location + minimal info so help is never blocked on a profile.
//
// Layout is mobile-first: one dominant SOS target in the thumb zone, large
// (>= 48px) tap targets, and short copy that can be read under stress.
type Mode = "choosing" | "live";

const BHW_PHONE = "tel:+6321234567";

export default function HouseholdLanding() {
  const [mode, setMode] = useState<Mode>("choosing");
  const [status, setStatus] = useState<IncidentStatus>("sos");
  const [note, setNote] = useState("");
  const [showUnregistered, setShowUnregistered] = useState(false);
  // Whether the SOS carried an enrolled profile (registered path) or not.
  const [withIdentity, setWithIdentity] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const patient = mockIncident.patient;

  function startSos(withProfile: boolean) {
    setWithIdentity(withProfile);
    setStatus("sos");
    setSentAt(Date.now());
    setMode("live");
    window.scrollTo({ top: 0 });
  }

  function resetDemo() {
    setMode("choosing");
    setNote("");
    setShowUnregistered(false);
    setSentAt(null);
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-md px-4 pb-6 pt-5">
        {mode === "choosing" ? (
          <ChooseScreen
            patientName={patient.name}
            patientAge={patient.age}
            conditions={patient.conditions}
            note={note}
            onNoteChange={setNote}
            showUnregistered={showUnregistered}
            onToggleUnregistered={() => setShowUnregistered((v) => !v)}
            onSos={startSos}
          />
        ) : (
          <LiveScreen
            status={status}
            sentAt={sentAt}
            withIdentity={withIdentity}
            note={note}
            patient={patient}
            onReset={resetDemo}
          />
        )}
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Choose screen                                                       */
/* ------------------------------------------------------------------ */

function ChooseScreen({
  patientName,
  patientAge,
  conditions,
  note,
  onNoteChange,
  showUnregistered,
  onToggleUnregistered,
  onSos,
}: {
  patientName: string;
  patientAge: number;
  conditions: string[];
  note: string;
  onNoteChange: (v: string) => void;
  showUnregistered: boolean;
  onToggleUnregistered: () => void;
  onSos: (withProfile: boolean) => void;
}) {
  const initials = patientName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Get help now
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-base text-slate-600">
          One tap rings the nearest health worker and readies an ambulance.
        </p>
      </header>

      {/* Who this SOS is for */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-emergency"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">Sending as</p>
          <p className="truncate text-base font-semibold text-slate-900">
            {patientName}, {patientAge}
          </p>
          <p className="truncate text-xs text-slate-500">
            {conditions.join(" · ")}
          </p>
        </div>
        <Badge tone="green">Enrolled</Badge>
      </div>

      {/* Primary SOS */}
      <div className="relative mx-auto mt-8 flex h-60 w-60 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-emergency/20 motion-reduce:animate-none"
        />
        <span
          aria-hidden
          className="absolute inset-4 rounded-full bg-emergency/10"
        />
        <button
          type="button"
          onClick={() => onSos(true)}
          aria-label={`Send SOS with ${patientName}'s profile`}
          className="relative flex h-48 w-48 select-none flex-col items-center justify-center rounded-full bg-emergency text-white shadow-[0_12px_30px_-6px_rgba(220,38,38,0.6)] transition active:scale-95 active:bg-emergency-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 focus-visible:ring-offset-4"
        >
          <span className="text-6xl font-black tracking-wider">SOS</span>
          <span className="mt-1 text-sm font-medium text-white/90">
            Tap once
          </span>
        </button>
      </div>

      {/* What happens next */}
      <ul className="mt-8 grid grid-cols-3 gap-2 text-center">
        <Step icon={<PhoneRingIcon />} label="Health worker calls you" />
        <Step icon={<AmbulanceIcon />} label="Ambulance gets ready" />
        <Step icon={<PinIcon />} label="Your location is shared" />
      </ul>

      {/* Unregistered path */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={onToggleUnregistered}
          aria-expanded={showUnregistered}
          aria-controls="unregistered-panel"
          className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <span>
            <span className="block text-base font-semibold text-slate-900">
              Helping someone else?
            </span>
            <span className="block text-sm text-slate-500">
              Not registered? No profile needed.
            </span>
          </span>
          <ChevronIcon open={showUnregistered} />
        </button>

        {showUnregistered && (
          <div id="unregistered-panel" className="px-4 pb-4">
            <label
              htmlFor="sos-note"
              className="block text-sm font-medium text-slate-700"
            >
              What&apos;s happening?{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="sos-note"
              rows={2}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. elderly man collapsed, not responding"
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-emergency focus:outline-none focus:ring-2 focus:ring-emergency/30"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              We send your location now. The health worker confirms details on
              the call.
            </p>
            <button
              type="button"
              onClick={() => onSos(false)}
              className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-xl bg-emergency text-lg font-bold text-white shadow-sm transition active:scale-[0.98] active:bg-emergency-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
            >
              Send quick SOS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emergency shadow-sm ring-1 ring-slate-200">
        {icon}
      </span>
      <span className="text-xs leading-snug text-slate-600">{label}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Live screen                                                         */
/* ------------------------------------------------------------------ */

function LiveScreen({
  status,
  sentAt,
  withIdentity,
  note,
  patient,
  onReset,
}: {
  status: IncidentStatus;
  sentAt: number | null;
  withIdentity: boolean;
  note: string;
  patient: typeof mockIncident.patient;
  onReset: () => void;
}) {
  const elapsed = useElapsed(sentAt);

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <section
        aria-live="polite"
        className="overflow-hidden rounded-2xl bg-emergency p-5 text-white shadow-lg"
      >
        <div className="flex items-center justify-between text-sm font-medium text-white/90">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            SOS sent
          </span>
          <span className="tabular-nums" aria-label={`${elapsed} since SOS`}>
            {elapsed}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          Help is coming
        </h1>
        <p className="mt-1 text-base text-white/90">
          {STATUS_LABEL[status]}. Keep your phone close and the volume up.
        </p>
      </section>

      {/* Live call */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">
              Connecting to nearest health worker…
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Stay on the line and follow their guidance.
            </p>
          </div>
          <Badge tone="green">● Live</Badge>
        </div>
        <a
          href={BHW_PHONE}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-emergency bg-white text-base font-bold text-emergency transition active:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
        >
          <PhoneRingIcon />
          Weak signal? Call by phone
        </a>
      </section>

      {/* Progress */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Progress
        </h2>
        <StatusStepper status={status} variant="vertical" />
      </section>

      {/* Shared info */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Shared with the health worker
          </h2>
          {!withIdentity && <Badge tone="amber">Unregistered</Badge>}
        </div>

        {withIdentity ? (
          <dl className="divide-y divide-slate-100 text-sm">
            <InfoRow label="Patient" value={`${patient.name}, ${patient.age}`} />
            <InfoRow label="Conditions" value={patient.conditions.join(", ")} />
            <InfoRow label="Address" value={patient.address} />
            <InfoRow label="Landmark" value={patient.landmark} />
          </dl>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-0.5 text-emergency">
                <PinIcon />
              </span>
              Location sent. The health worker will confirm identity and
              details on the call.
            </p>
            {note && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                “{note}”
              </p>
            )}
          </>
        )}
      </section>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onReset}
          className="min-h-[44px] rounded-lg px-4 text-sm font-medium text-slate-500 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Reset demo
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

// mm:ss since the SOS was sent, so the family can see time is being tracked.
function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);
  const secs = since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/* ------------------------------------------------------------------ */
/* Icons (inline, decorative)                                          */
/* ------------------------------------------------------------------ */

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
};

function PhoneRingIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      <path d="M15 3a6 6 0 0 1 6 6" />
      <path d="M15 7a2 2 0 0 1 2 2" />
    </svg>
  );
}

function AmbulanceIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 17V7a1 1 0 0 1 1-1h10v11" />
      <path d="M14 10h4l3 3v4h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
      <path d="M8 9v4M6 11h4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      {...iconProps}
      className={cn(
        "h-5 w-5 shrink-0 text-slate-400 transition-transform",
        open && "rotate-180",
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
