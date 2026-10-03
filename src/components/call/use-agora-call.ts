"use client";

// React state around one AgoraCall: call state, mute, duration, no-answer
// flag, and call lifecycle events logged to incident_events (best effort).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgoraCall,
  TokenRequestError,
  type CallFailure,
  type CallState,
  type TokenGrant,
} from "@/lib/agora/client";
import type { CallRole } from "@/lib/agora/channel";

// FLOW.md: "BHW doesn't answer in 30s". Here that surfaces the phone fallback;
// the call keeps ringing so a late answer still connects.
export const NO_ANSWER_MS = 30_000;

async function fetchToken(incidentId: string, role: CallRole): Promise<TokenGrant> {
  let res: Response;
  try {
    res = await fetch("/api/agora/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, role }),
    });
  } catch {
    throw new TokenRequestError("network");
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new TokenRequestError("forbidden");
  }
  if (res.status === 503) throw new TokenRequestError("not_configured");
  if (!res.ok) throw new TokenRequestError("token");
  return (await res.json()) as TokenGrant;
}

// Fire-and-forget: a failed event write must never affect the call.
export function postCallEvent(
  incidentId: string,
  type: "call_started" | "call_ended" | "call_failed",
  reason?: string,
) {
  void fetch(`/api/incidents/${incidentId}/call-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason ? { type, reason } : { type }),
    keepalive: true, // still delivered if the tab is closing
  }).catch(() => undefined);
}

export interface UseAgoraCall {
  state: CallState;
  failure: CallFailure | null;
  muted: boolean;
  reconnecting: boolean;
  noAnswer: boolean;
  durationSec: number;
  start: () => void;
  end: () => void;
  toggleMute: () => void;
}

export function useAgoraCall({
  incidentId,
  role,
  onStreamMessage,
}: {
  incidentId: string | null;
  role: CallRole;
  onStreamMessage?: (uid: number, payload: Uint8Array) => void;
}): UseAgoraCall {
  const [state, setState] = useState<CallState>("idle");
  const [failure, setFailure] = useState<CallFailure | null>(null);
  const [muted, setMuted] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const callRef = useRef<AgoraCall | null>(null);
  const streamRef = useRef(onStreamMessage);
  streamRef.current = onStreamMessage;

  const start = useCallback(() => {
    if (!incidentId || callRef.current) return;
    setFailure(null);
    setMuted(false);
    setNoAnswer(false);
    setConnectedAt(null);

    const call = new AgoraCall({
      role,
      fetchToken: () => fetchToken(incidentId, role),
      onReconnecting: setReconnecting,
      onStreamMessage: (uid, payload) => streamRef.current?.(uid, payload),
      onState: (next, why) => {
        setState(next);
        if (next === "ringing" && role === "household") {
          postCallEvent(incidentId, "call_started"); // rings the BHWs
        }
        if (next === "connected") setConnectedAt((t) => t ?? Date.now());
        if (next === "failed") {
          setFailure(why ?? "unknown");
          postCallEvent(incidentId, "call_failed", why ?? "unknown");
          callRef.current = null;
        }
        if (next === "ended") {
          postCallEvent(incidentId, "call_ended");
          callRef.current = null;
        }
      },
    });
    callRef.current = call;
    void call.start();
  }, [incidentId, role]);

  const end = useCallback(() => {
    void callRef.current?.end();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      void callRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  // No-answer flag after NO_ANSWER_MS of ringing.
  useEffect(() => {
    if (state !== "ringing") return;
    const id = window.setTimeout(() => setNoAnswer(true), NO_ANSWER_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  // Call duration ticker.
  useEffect(() => {
    if (state !== "connected") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  // Leave the channel if the component unmounts mid-call.
  useEffect(() => () => void callRef.current?.end(), []);

  return {
    state,
    failure,
    muted,
    reconnecting,
    noAnswer,
    durationSec:
      connectedAt === null ? 0 : Math.max(0, Math.floor((now - connectedAt) / 1000)),
    start,
    end,
    toggleMute,
  };
}

export function formatDuration(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

// Plain-language message per failure, with the fallback the user should take.
export const FAILURE_MESSAGE: Record<CallFailure, string> = {
  insecure_context: "Calling needs a secure (https) connection on this device.",
  mic_denied: "Microphone access was blocked. Allow it in your browser, or call by phone.",
  mic_unavailable: "No microphone found on this device.",
  forbidden: "You can't join this call.",
  not_configured: "In-app calling isn't set up yet.",
  token: "Couldn't start the call.",
  timeout: "The call took too long to connect.",
  network: "The connection dropped.",
  token_expired: "The call session expired.",
  unknown: "Something went wrong with the call.",
};
