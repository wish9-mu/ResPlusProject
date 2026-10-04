"use client";

import { useEffect, useState } from "react";
import { Ambulance, ChevronDown, MapPin, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui";
import { CallButton } from "@/components/call/CallButton";
import { StatusStepper } from "@/components/status-stepper";
import { TopBar } from "@/components/top-bar";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// The landing page IS the household experience (FLOW.md: never a dead end).
// Every SOS is unregistered for now: no profile, optional note, and a GPS fix
// if the phone allows it. The health worker confirms identity on the call.
// (Enrolled profiles come back once BHW enrollment writes real patients.)
//
// Layout is mobile-first: one dominant SOS target in the thumb zone, large
// (>= 48px) tap targets, and short copy that can be read under stress.
type Mode = "choosing" | "live";

// Placeholder BHW/LGU hotline for the tel: fallback until crew phones are set.
const BHW_PHONE = "tel:+6321234567";

// The SOS never waits longer than this for a GPS fix.
const GPS_WAIT_MS = 3000;

// Best-effort GPS fix. Resolves null (never rejects) if permission is denied,
// it takes too long, or the point is outside the Philippines (the API only
// accepts PH points). FLOW.md "Bad GPS": the BHW confirms location on the call.
function quickLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = window.setTimeout(() => resolve(null), GPS_WAIT_MS);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        window.clearTimeout(timer);
        const inPh =
          coords.latitude >= 4 && coords.latitude <= 22 &&
          coords.longitude >= 116 && coords.longitude <= 127;
        resolve(inPh ? { lat: coords.latitude, lng: coords.longitude } : null);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: GPS_WAIT_MS, maximumAge: 60_000 },
    );
  });
}

// Records the SOS as a real incident so health workers see it right away.
// Households get a silent anonymous Supabase session: no form, no delay.
// Every SOS is unregistered until real BHW enrollment exists.
// Resolves the incident id and whether a location was attached, or throws an
// Error with a user-facing message.
async function raiseSos(
  note: string,
): Promise<{ incidentId: string; locationShared: boolean }> {
  const supabase = createClient();
  const [location, sessionResult] = await Promise.all([
    quickLocation(),
    supabase.auth.getSession(),
  ]);
  if (!sessionResult.data.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error("Couldn't reach Res+. Call by phone or 911.");
  }
  const res = await fetch("/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      withProfile: false,
      note: note.trim() || undefined,
      location,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    incidentId?: string;
    error?: string;
  };
  if (!res.ok || !body.incidentId) {
    throw new Error(body.error ?? "Couldn't record the SOS. Call by phone or 911.");
  }
  return { incidentId: body.incidentId, locationShared: location !== null };
}

export default function HouseholdLanding() {
  const [mode, setMode] = useState<Mode>("choosing");
  const [status, setStatus] = useState<IncidentStatus>("sos");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  // null until we know; then whether a GPS fix went with the SOS.
  const [locationShared, setLocationShared] = useState<boolean | null>(null);

  function startSos() {
    setStatus("sos");
    setSentAt(Date.now());
    setIncidentId(null);
    setSetupError(null);
    setLocationShared(null);
    // Show the live screen immediately; recording the SOS happens behind it.
    setMode("live");
    window.scrollTo({ top: 0 });
    raiseSos(note).then(
      (result) => {
        setIncidentId(result.incidentId);
        setLocationShared(result.locationShared);
      },
      (error: Error) => setSetupError(error.message),
    );
  }

  function resetDemo() {
    // The incident stays open in Res+; a new SOS from this device reuses it.
    setMode("choosing");
    setNote("");
    setShowNote(false);
    setSentAt(null);
    setIncidentId(null);
    setSetupError(null);
    setLocationShared(null);
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-md px-4 pb-6 pt-5">
        {mode === "choosing" ? (
          <ChooseScreen
            note={note}
            onNoteChange={setNote}
            showNote={showNote}
            onToggleNote={() => setShowNote((v) => !v)}
            onSos={startSos}
          />
        ) : (
          <LiveScreen
            status={status}
            sentAt={sentAt}
            incidentId={incidentId}
            setupError={setupError}
            locationShared={locationShared}
            note={note}
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
  note,
  onNoteChange,
  showNote,
  onToggleNote,
  onSos,
}: {
  note: string;
  onNoteChange: (v: string) => void;
  showNote: boolean;
  onToggleNote: () => void;
  onSos: () => void;
}) {
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

      {/* Primary SOS. No profile needed: until BHW enrollment exists, every
          SOS is unregistered and the health worker confirms details on the call. */}
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
          onClick={onSos}
          aria-label="Send SOS"
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
        <Step icon={<PhoneCall aria-hidden className="h-5 w-5" />} label="Health worker calls you" />
        <Step icon={<Ambulance aria-hidden className="h-5 w-5" />} label="Ambulance gets ready" />
        <Step icon={<MapPin aria-hidden className="h-5 w-5" />} label="Location shared if you allow it" />
      </ul>

      {/* Optional details. The big SOS button never requires these. */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={onToggleNote}
          aria-expanded={showNote}
          aria-controls="sos-note-panel"
          className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <span>
            <span className="block text-base font-semibold text-slate-900">
              Helping someone else?
            </span>
            <span className="block text-sm text-slate-500">
              No profile needed. Add a short note if you can.
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-5 w-5 shrink-0 text-slate-400 transition-transform",
              showNote && "rotate-180",
            )}
          />
        </button>

        {showNote && (
          <div id="sos-note-panel" className="px-4 pb-4">
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
              The health worker confirms the details on the call.
            </p>
            <button
              type="button"
              onClick={onSos}
              className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-xl bg-emergency text-lg font-bold text-white shadow-sm transition active:scale-[0.98] active:bg-emergency-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
            >
              Send SOS with this note
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
  incidentId,
  setupError,
  locationShared,
  note,
  onReset,
}: {
  status: IncidentStatus;
  sentAt: number | null;
  incidentId: string | null;
  setupError: string | null;
  locationShared: boolean | null;
  note: string;
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

      {/* Live call (Agora). The phone fallback lives inside CallButton. */}
      <CallButton
        incidentId={incidentId}
        setupError={setupError}
        fallbackTel={BHW_PHONE}
        onNewSos={onReset}
      />

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
          <Badge tone="amber">Unregistered</Badge>
        </div>

        <p className="flex items-start gap-2 text-sm text-slate-600">
          <span className="mt-0.5 text-emergency">
            <MapPin aria-hidden className="h-5 w-5" />
          </span>
          {locationShared === null
            ? "Sending your SOS…"
            : locationShared
              ? "Your location was sent. The health worker will confirm who needs help on the call."
              : "Location not shared. Tell the health worker where you are when they call."}
        </p>
        {note && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            “{note}”
          </p>
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
