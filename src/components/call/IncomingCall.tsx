"use client";

// BHW side: a new SOS, from an enrolled household or an unregistered phone.
// Accepting claims the incident (first BHW wins) and only then connects the
// call. Accepting does NOT confirm the emergency or dispatch an ambulance:
// "Confirm emergency" stays a separate, human decision (FLOW.md rule 2).
import { Loader2, Phone, PhoneOff } from "lucide-react";

export interface IncomingCallInfo {
  incidentId: string;
  patientName: string | null;
  note: string | null;
  startedAt: string;
}

export function IncomingCall({
  call,
  answering,
  onAnswer,
  onDecline,
}: {
  call: IncomingCallInfo;
  answering: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      role="alertdialog"
      aria-labelledby={`incoming-${call.incidentId}`}
      className="rounded-2xl border-2 border-emergency bg-white p-4 shadow-lg"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-emergency">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emergency opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emergency" />
        </span>
        New SOS · waiting for a health worker
      </div>
      <h2
        id={`incoming-${call.incidentId}`}
        className="mt-2 text-xl font-bold text-slate-900"
      >
        {call.patientName ?? "Unregistered caller"}
      </h2>
      <p className="mt-0.5 font-mono text-xs text-slate-500">
        Incident {call.incidentId.slice(0, 8)}
      </p>
      {call.note && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
          “{call.note}”
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Accepting connects the call. It does not dispatch the ambulance.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onAnswer}
          disabled={answering}
          className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 text-base font-bold text-white transition active:scale-[0.98] hover:bg-green-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-300 disabled:opacity-60"
        >
          {answering ? (
            <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          ) : (
            <Phone aria-hidden className="h-5 w-5" />
          )}
          Accept
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={answering}
          className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white text-base font-bold text-slate-700 transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-60"
        >
          <PhoneOff aria-hidden className="h-5 w-5" />
          Decline
        </button>
      </div>
    </section>
  );
}
