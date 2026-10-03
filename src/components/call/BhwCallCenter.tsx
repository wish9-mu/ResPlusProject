"use client";

// BHW call center: rings on household SOS calls (all on-duty BHWs see them;
// the first to answer claims the incident), runs the active call, starts live
// transcription, and relays final transcript segments to /api/transcripts.
//
// Safety (FLOW.md): nothing here gates dispatch. Call or STT failures only
// change what this panel shows; the BHW keeps working the incident below.
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneIncoming } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { speakerForUid } from "@/lib/agora/channel";
import { decodeSttPayload, type SttSegment } from "@/lib/agora/stt-message";
import { sourceKey } from "@/lib/transcripts/persist";
import { ActiveCall } from "./ActiveCall";
import { IncomingCall, type IncomingCallInfo } from "./IncomingCall";
import { TranscriptPanel, type TranscriptStatus } from "./TranscriptPanel";
import { useAgoraCall } from "./use-agora-call";
import { BhwDashboard } from "@/app/bhw/bhw-dashboard";
import type { PatientSummary } from "@/lib/incidents/repo";

// Unaccepted SOS older than this stop ringing (stale or abandoned).
const RING_WINDOW_MS = 30 * 60 * 1000;
const MAX_QUEUED_SEGMENTS = 200;
const FLUSH_DELAY_MS = 400;
const RETRY_DELAY_MS = 3000;

interface ActiveInfo {
  incidentId: string;
  patientName: string | null;
  patient: PatientSummary | null;
  note: string | null;
}

export function BhwCallCenter() {
  const [incoming, setIncoming] = useState<IncomingCallInfo[]>([]);
  const [declined, setDeclined] = useState<Set<string>>(() => new Set());
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  // The incident this BHW accepted. Stays open after the call card is closed
  // (the BHW may still be coaching or travelling) until "Back to queue".
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>("off");
  const [partial, setPartial] = useState<{ speaker: string; text: string } | null>(null);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = active?.incidentId ?? null;
  const callStartedFor = useRef<string | null>(null);
  const sttStartedFor = useRef<string | null>(null);
  const agentIdRef = useRef<string | null>(null);
  const queueRef = useRef<Map<string, SttSegment>>(new Map());
  const flushTimer = useRef<number | null>(null);

  /* ---------------- incoming calls ---------------- */

  // Every open SOS that no BHW has accepted yet is an incoming entry, whether
  // it came from an enrolled household or a random unregistered phone.
  const loadRinging = useCallback(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - RING_WINDOW_MS).toISOString();
    const { data: incidents } = await supabase
      .from("incidents")
      .select("id,patient_id,note,created_at")
      .is("assigned_bhw", null)
      .neq("status", "closed")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20)
      .returns<
        {
          id: string;
          patient_id: string | null;
          note: string | null;
          created_at: string;
        }[]
      >();
    const open = incidents ?? [];
    if (open.length === 0) {
      setIncoming([]);
      return;
    }

    const patientIds = open.map((i) => i.patient_id).filter((p): p is string => !!p);
    const names = new Map<string, string>();
    if (patientIds.length) {
      const { data: patients } = await supabase
        .from("patients")
        .select("id,name")
        .in("id", patientIds)
        .returns<{ id: string; name: string }[]>();
      for (const p of patients ?? []) names.set(p.id, p.name);
    }

    setIncoming(
      open.map((i) => ({
        incidentId: i.id,
        patientName: i.patient_id ? names.get(i.patient_id) ?? null : null,
        note: i.note,
        startedAt: i.created_at,
      })),
    );
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void loadRinging();
    let timer: number | null = null;
    const reload = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRinging(), 250);
    };
    // New SOS (INSERT) rings; another BHW accepting (UPDATE) clears it.
    const channel = supabase
      .channel("bhw-call-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, reload)
      .subscribe();
    // Backup in case the realtime socket is blocked: re-check every 10s.
    const poll = window.setInterval(() => void loadRinging(), 10_000);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [loadRinging]);

  async function answer(info: IncomingCallInfo) {
    setAnsweringId(info.incidentId);
    setNotice(null);
    let res: Response | null = null;
    try {
      res = await fetch(`/api/incidents/${info.incidentId}/answer`, { method: "POST" });
    } catch {
      res = null;
    }
    setAnsweringId(null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setNotice((body as { error?: string }).error ?? "Could not answer. Check your connection.");
      void loadRinging();
      return;
    }
    const data = (await res.json()) as {
      patientName: string | null;
      patient: PatientSummary | null;
      note: string | null;
    };
    setIncoming((list) => list.filter((c) => c.incidentId !== info.incidentId));
    setCallOpen(true);
    setActive({
      incidentId: info.incidentId,
      patientName: data.patientName ?? info.patientName,
      patient: data.patient ?? null,
      note: data.note ?? info.note,
    });
  }

  function decline(info: IncomingCallInfo) {
    // Local only: other BHWs keep ringing, so the household isn't left alone.
    setDeclined((s) => new Set(s).add(info.incidentId));
  }

  /* ---------------- transcript relay ---------------- */

  const scheduleFlush = useCallback((delay = FLUSH_DELAY_MS) => {
    if (flushTimer.current) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const flush = useCallback(async () => {
    const incidentId = activeIdRef.current;
    const batch = [...queueRef.current.values()].slice(0, 25);
    if (!incidentId || batch.length === 0) return;
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId,
          segments: batch.map(({ uid, sentenceId, offset, text }) => ({
            uid,
            sentenceId,
            offset,
            text,
          })),
        }),
      });
      // 400 = a malformed batch; retrying won't help, so drop it.
      if (!res.ok && res.status !== 400) throw new Error(String(res.status));
      for (const s of batch) queueRef.current.delete(sourceKey(s));
      setTranscriptStatus((s) => (s === "save_failed" ? "live" : s));
      if (queueRef.current.size > 0) scheduleFlush();
    } catch {
      setTranscriptStatus("save_failed");
      scheduleFlush(RETRY_DELAY_MS);
    }
  }, [scheduleFlush]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const onStreamMessage = useCallback(
    async (_botUid: number, payload: Uint8Array) => {
      let segments: SttSegment[];
      try {
        segments = await decodeSttPayload(payload);
      } catch {
        return; // undecodable message: skip it, the call is unaffected
      }
      const usable = segments.filter((s) => s.uid >= 0 && s.sentenceId >= 0);
      if (usable.length === 0) return;

      const pending = usable.filter((s) => !s.isFinal);
      setPartial(
        pending.length
          ? { speaker: speakerForUid(pending[0].uid), text: pending.map((s) => s.text).join(" ") }
          : null,
      );
      for (const s of usable.filter((x) => x.isFinal)) {
        queueRef.current.set(sourceKey(s), s);
        if (queueRef.current.size > MAX_QUEUED_SEGMENTS) {
          const oldest = queueRef.current.keys().next().value;
          if (oldest) queueRef.current.delete(oldest);
        }
      }
      if (usable.some((s) => s.isFinal)) scheduleFlush();
    },
    [scheduleFlush],
  );

  /* ---------------- active call ---------------- */

  const call = useAgoraCall({
    incidentId: active?.incidentId ?? null,
    role: "bhw",
    onStreamMessage: (uid, payload) => void onStreamMessage(uid, payload),
  });

  // Join as soon as the incident is ours.
  useEffect(() => {
    if (active && callStartedFor.current !== active.incidentId) {
      callStartedFor.current = active.incidentId;
      call.start();
    }
  }, [active, call]);

  // Start STT once audio is connected. Failure only changes the panel.
  useEffect(() => {
    if (call.state !== "connected" || !active) return;
    if (sttStartedFor.current === active.incidentId) return;
    sttStartedFor.current = active.incidentId;
    setTranscriptStatus("starting");
    fetch("/api/agora/transcription/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: active.incidentId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        agentIdRef.current = ((await res.json()) as { agentId: string }).agentId;
        setTranscriptStatus("live");
      })
      .catch(() => setTranscriptStatus("unavailable"));
  }, [call.state, active]);

  // Call over: save what's queued and stop the STT agent (best effort).
  useEffect(() => {
    if (call.state !== "ended" && call.state !== "failed") return;
    setPartial(null);
    void flushRef.current();
    sttStartedFor.current = null; // a call-back starts a fresh STT agent
    const agentId = agentIdRef.current;
    const incidentId = activeIdRef.current;
    agentIdRef.current = null;
    if (agentId && incidentId) {
      void fetch("/api/agora/transcription/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, agentId }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [call.state]);

  // Hide the finished call card; the incident workspace stays open.
  function closeCall() {
    setCallOpen(false);
    setTranscriptStatus("off");
    setPartial(null);
  }

  function callBack() {
    setCallOpen(true);
    call.start();
  }

  // Done with this incident: leave any call and return to the SOS queue.
  function backToQueue() {
    call.end();
    setActive(null);
    setCallOpen(false);
    callStartedFor.current = null;
    sttStartedFor.current = null;
    setTranscriptStatus("off");
    setPartial(null);
    queueRef.current.clear();
    void loadRinging();
  }

  /* ---------------- render ---------------- */

  const visibleIncoming = incoming.filter(
    (c) => !declined.has(c.incidentId) && c.incidentId !== active?.incidentId,
  );

  return (
    <div className="mb-4 space-y-3">
      {notice && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {active && callOpen && (
        <ActiveCall
          incidentId={active.incidentId}
          patientName={active.patientName}
          call={call}
          onClose={closeCall}
          onCallBack={call.start}
        >
          <TranscriptPanel
            incidentId={active.incidentId}
            status={transcriptStatus}
            partial={partial}
          />
        </ActiveCall>
      )}

      {active && !callOpen && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={callBack}
            className="min-h-[44px] flex-1 rounded-xl bg-green-600 px-3 text-sm font-bold text-white hover:bg-green-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-300"
          >
            Call the caller again
          </button>
        </div>
      )}

      {visibleIncoming.map((info) => (
        <IncomingCall
          key={info.incidentId}
          call={info}
          answering={answeringId === info.incidentId}
          onAnswer={() => void answer(info)}
          onDecline={() => decline(info)}
        />
      ))}

      {!active && visibleIncoming.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
          <PhoneIncoming aria-hidden className="h-4 w-4" />
          No incoming SOS. New SOS ring here. Keep this screen open.
        </p>
      )}

      {/* Incident workspace: only for an SOS this BHW accepted. */}
      {active && (
        <section aria-label="Accepted incident" className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Your incident</h2>
            <button
              type="button"
              onClick={backToQueue}
              className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-slate-500 hover:text-emergency hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Back to queue
            </button>
          </div>
          <BhwDashboard
            key={active.incidentId}
            incident={{
              incidentId: active.incidentId,
              patient: active.patient,
              note: active.note,
            }}
          />
        </section>
      )}
    </div>
  );
}
