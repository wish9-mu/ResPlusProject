"use client";

// BHW side: the call in progress. Patient, incident id, duration, mute, end.
import { Loader2, Mic, MicOff, Phone, PhoneOff, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  FAILURE_MESSAGE,
  formatDuration,
  type UseAgoraCall,
} from "./use-agora-call";

export function ActiveCall({
  incidentId,
  patientName,
  call,
  onClose,
  onCallBack,
  children,
}: {
  incidentId: string;
  patientName: string | null;
  call: UseAgoraCall;
  onClose: () => void;
  // Rejoin the incident channel after the call ended or failed.
  onCallBack?: () => void;
  children?: React.ReactNode; // transcript panel
}) {
  const live =
    call.state === "connecting" || call.state === "ringing" || call.state === "connected";

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {stateLabel(call.state)}
          </p>
          <h2 className="truncate text-xl font-bold text-slate-900">
            {patientName ?? "Unregistered caller"}
          </h2>
          <p className="font-mono text-xs text-slate-500">
            Incident {incidentId.slice(0, 8)}
          </p>
        </div>
        {call.state === "connected" ? (
          <Badge tone="green">● {formatDuration(call.durationSec)}</Badge>
        ) : live ? (
          <Loader2 aria-hidden className="h-5 w-5 animate-spin text-emergency" />
        ) : null}
      </div>

      {call.reconnecting && live && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Connection unstable. Reconnecting…
        </p>
      )}
      {call.state === "failed" && call.failure && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {FAILURE_MESSAGE[call.failure]} Keep working the incident below; the
          emergency workflow does not depend on the call.
        </p>
      )}

      {children && <div className="mt-4">{children}</div>}

      <div className="mt-4 flex gap-2">
        {live ? (
          <>
            <button
              type="button"
              onClick={call.toggleMute}
              disabled={call.state !== "connected"}
              aria-pressed={call.muted}
              className={btn("border-2 border-slate-300 bg-white text-slate-800")}
            >
              {call.muted ? (
                <MicOff aria-hidden className="h-5 w-5" />
              ) : (
                <Mic aria-hidden className="h-5 w-5" />
              )}
              {call.muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={call.end}
              className={btn("bg-emergency text-white hover:bg-emergency-dark")}
            >
              <PhoneOff aria-hidden className="h-5 w-5" />
              End call
            </button>
          </>
        ) : (
          <>
            {onCallBack && (
              <button
                type="button"
                onClick={onCallBack}
                className={btn("bg-green-600 text-white hover:bg-green-700")}
              >
                <Phone aria-hidden className="h-5 w-5" />
                Call back
              </button>
            )}
            <button type="button" onClick={onClose} className={btn("bg-slate-900 text-white")}>
              <X aria-hidden className="h-5 w-5" />
              Close
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function btn(extra: string) {
  return cn(
    "flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-50",
    extra,
  );
}

function stateLabel(state: UseAgoraCall["state"]): string {
  switch (state) {
    case "connecting":
      return "Connecting…";
    case "ringing":
      return "Accepted · connecting to the caller…";
    case "connected":
      return "On call";
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "Call";
  }
}
