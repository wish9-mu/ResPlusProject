"use client";

// Household side of the call. Flow (approved): the SOS reaches every BHW at
// once; a BHW accepts the emergency first, and only then does this device
// join the call, automatically. The phone fallback stays visible in every
// state (FLOW.md: never a dead end).
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneCall, PhoneOff, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIncidentAcceptance } from "./use-incident-acceptance";
import {
  FAILURE_MESSAGE,
  NO_ANSWER_MS,
  formatDuration,
  useAgoraCall,
} from "./use-agora-call";

const primaryBtn =
  "flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl text-lg font-bold transition active:scale-[0.98] focus:outline-none focus-visible:ring-4";

type CallState = ReturnType<typeof useAgoraCall>["state"];

export function CallButton({
  incidentId,
  setupError,
  fallbackTel,
  onNewSos,
}: {
  // null while the SOS is still being recorded.
  incidentId: string | null;
  setupError: string | null;
  fallbackTel: string;
  // Back to the SOS screen, used once the health worker closes this SOS.
  onNewSos: () => void;
}) {
  const call = useAgoraCall({ incidentId, role: "household" });
  const { accepted, closed } = useIncidentAcceptance(incidentId);
  const waitingTooLong = useWaitedTooLong(incidentId, accepted);

  // The health worker closed this SOS: leave any call still waiting.
  const { end } = call;
  useEffect(() => {
    if (closed) end();
  }, [closed, end]);

  if (closed) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p className="text-base font-semibold text-slate-900">This SOS was closed</p>
        <p className="mt-0.5 text-sm text-slate-500">
          A health worker closed it. If you still need help, send a new SOS.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onNewSos}
            className={cn(
              primaryBtn,
              "bg-emergency text-white focus-visible:ring-red-300 active:bg-emergency-dark",
            )}
          >
            Send a new SOS
          </button>
          <a
            href={fallbackTel}
            className={cn(
              primaryBtn,
              "border-2 border-emergency bg-white text-base text-emergency focus-visible:ring-red-200",
            )}
          >
            <PhoneCall aria-hidden className="h-5 w-5" />
            Call by phone
          </a>
        </div>
      </section>
    );
  }

  // Join the call automatically, once, as soon as a BHW accepts.
  const autoStarted = useRef<string | null>(null);
  useEffect(() => {
    if (accepted && incidentId && autoStarted.current !== incidentId) {
      autoStarted.current = incidentId;
      call.start();
    }
  }, [accepted, incidentId, call]);

  const inCall =
    call.state === "connecting" || call.state === "ringing" || call.state === "connected";
  const waiting = !!incidentId && !accepted && !setupError;
  const showFallbackEmphasis =
    call.state === "failed" || call.noAnswer || waitingTooLong || !!setupError;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {headline(call.state, waiting, !!setupError)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {subline(call.state, {
              setupError,
              incidentId,
              waiting,
              waitingTooLong,
              noAnswer: call.noAnswer,
            })}
          </p>
        </div>
        {call.state === "connected" && (
          <Badge tone="green">● {formatDuration(call.durationSec)}</Badge>
        )}
        {(waiting || call.state === "connecting" || call.state === "ringing" || (!incidentId && !setupError)) && (
          <Loader2 aria-hidden className="h-5 w-5 shrink-0 animate-spin text-emergency" />
        )}
      </div>

      {call.reconnecting && inCall && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Weak connection. Trying to reconnect…
        </p>
      )}

      {call.state === "failed" && call.failure && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {FAILURE_MESSAGE[call.failure]} Use the phone button below.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {/* Retry / rejoin. Before acceptance there is nothing to join yet. */}
        {accepted && (call.state === "ended" || call.state === "failed") && (
          <button
            type="button"
            onClick={call.start}
            className={cn(
              primaryBtn,
              "bg-emergency text-white focus-visible:ring-red-300 active:bg-emergency-dark",
            )}
          >
            <RotateCcw aria-hidden className="h-5 w-5" />
            {call.state === "failed" ? "Try the call again" : "Call again"}
          </button>
        )}

        {inCall && (
          <div className="flex gap-2">
            {call.state === "connected" && (
              <button
                type="button"
                onClick={call.toggleMute}
                aria-pressed={call.muted}
                className={cn(
                  primaryBtn,
                  "flex-1 border-2 border-slate-300 bg-white text-slate-800 focus-visible:ring-slate-300",
                )}
              >
                {call.muted ? (
                  <MicOff aria-hidden className="h-5 w-5" />
                ) : (
                  <Mic aria-hidden className="h-5 w-5" />
                )}
                {call.muted ? "Unmute" : "Mute"}
              </button>
            )}
            <button
              type="button"
              onClick={call.end}
              className={cn(
                primaryBtn,
                "flex-1 bg-slate-900 text-white focus-visible:ring-slate-400",
              )}
            >
              <PhoneOff aria-hidden className="h-5 w-5" />
              End call
            </button>
          </div>
        )}

        <a
          href={fallbackTel}
          className={cn(
            primaryBtn,
            "border-2 border-emergency bg-white text-base text-emergency active:bg-red-50 focus-visible:ring-red-200",
            showFallbackEmphasis && "bg-red-50",
          )}
        >
          <PhoneCall aria-hidden className="h-5 w-5" />
          Weak signal? Call by phone
        </a>
      </div>
    </section>
  );
}

// True once the SOS has waited NO_ANSWER_MS without a BHW accepting.
function useWaitedTooLong(incidentId: string | null, accepted: boolean): boolean {
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => {
    setTooLong(false);
    if (!incidentId || accepted) return;
    const id = window.setTimeout(() => setTooLong(true), NO_ANSWER_MS);
    return () => window.clearTimeout(id);
  }, [incidentId, accepted]);
  return tooLong;
}

function headline(state: CallState, waiting: boolean, hasError: boolean): string {
  if (hasError) return "Couldn't reach Res+";
  if (waiting) return "Waiting for a health worker…";
  switch (state) {
    case "connecting":
      return "Connecting you to the health worker…";
    case "ringing":
      return "Waiting for the health worker to join…";
    case "connected":
      return "Connected to a health worker";
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "Sending your SOS…";
  }
}

function subline(
  state: CallState,
  s: {
    setupError: string | null;
    incidentId: string | null;
    waiting: boolean;
    waitingTooLong: boolean;
    noAnswer: boolean;
  },
): string {
  if (s.setupError) return s.setupError;
  if (!s.incidentId) return "Recording your emergency…";
  if (s.waiting) {
    return s.waitingTooLong
      ? "No one has accepted yet. Keep waiting, or call by phone."
      : "Your SOS was sent. The call connects as soon as a health worker accepts.";
  }
  if (state === "ringing") {
    return s.noAnswer
      ? "The health worker hasn't joined yet. Keep waiting, or call by phone."
      : "You're on the line. The health worker's screen is ringing.";
  }
  if (state === "connected") return "Stay on the line and follow their guidance.";
  if (state === "ended") return "Help is still on the way. Call again if you need to.";
  if (state === "failed") return "Help is still on the way even without the call.";
  return "Allow the microphone if your browser asks.";
}
