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
import type { LatLng } from "@/lib/types";
import { parseEwkbPoint } from "@/lib/geo/ewkb";

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
  location: LatLng | null;
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

  const myIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = active?.incidentId ?? null;
  // True while this BHW is connecting/ringing/connected on the active incident.
  const callLiveRef = useRef(false);
  const callStartedFor = useRef<string | null>(null);
  const sttStartedFor = useRef<string | null>(null);
  const agentIdRef = useRef<string | null>(null);
  const queueRef = useRef<Map<string, SttSegment>>(new Map());
  const flushTimer = useRef<number | null>(null);

  /* ---------------- incoming calls ---------------- */

  // Incoming entries:
  //   1. every open SOS no BHW has accepted yet (enrolled or unregistered), and
  //   2. call-backs: incidents this BHW already accepted where the household
  //      is back on the line (latest call event is call_started) and this BHW
  //      isn't currently in that call.
  const loadRinging = useCallback(async () => {
    const supabase = createClient();
    if (!myIdRef.current) {
      const { data } = await supabase.auth.getUser();
      myIdRef.current = data.user?.id ?? null;
    }
    const me = myIdRef.current;
    const since = new Date(Date.now() - RING_WINDOW_MS).toISOString();

    type Row = { id: string; patient_id: string | null; note: string | null; created_at: string };
    const [unassignedRes, mineRes] = await Promise.all([
      supabase
        .from("incidents")
        .select("id,patient_id,note,created_at")
        .is("assigned_bhw", null)
        .neq("status", "closed")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(20)
        .returns<Row[]>(),
      me
        ? supabase
            .from("incidents")
            .select("id,patient_id,note,created_at")
            .eq("assigned_bhw", me)
            .neq("status", "closed")
            .limit(20)
            .returns<Row[]>()
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    // Which of my incidents have the household calling back?
    const mine = mineRes.data ?? [];
    const callbackIds = new Set<string>();
    if (mine.length) {
      const { data: events } = await supabase
        .from("incident_events")
        .select("incident_id,type")
        .in(
          "incident_id",
          mine.map((i) => i.id),
        )
        .in("type", ["call_started", "call_ended", "call_failed"])
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<{ incident_id: string; type: string }[]>();
      const latest = new Map<string, string>();
      for (const e of events ?? []) {
        if (!latest.has(e.incident_id)) latest.set(e.incident_id, e.type);
      }
      for (const [incidentId, type] of latest) {
        const inThisCall = incidentId === activeIdRef.current && callLiveRef.current;
        if (type === "call_started" && !inThisCall) callbackIds.add(incidentId);
      }
    }

    const open: (Row & { callback: boolean })[] = [
      ...mine.filter((i) => callbackIds.has(i.id)).map((i) => ({ ...i, callback: true })),
      ...(unassignedRes.data ?? []).map((i) => ({ ...i, callback: false })),
    ];
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
        callback: i.callback,
      })),
    );
  }, []);

  // Keep the open incident's location and note current: a repeat SOS from the
  // caller can bring a first or newer GPS fix. Realtime + 10s poll backup.
  const activeIncidentId = active?.incidentId ?? null;
  useEffect(() => {
    if (!activeIncidentId) return;
    const supabase = createClient();
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase
        .from("incidents")
        .select("location,note")
        .eq("id", activeIncidentId)
        .maybeSingle<{ location: string | null; note: string | null }>();
      if (cancelled || !data) return;
      const location = parseEwkbPoint(data.location);
      setActive((prev) => {
        if (!prev || prev.incidentId !== activeIncidentId) return prev;
        const sameLocation =
          prev.location?.lat === location?.lat && prev.location?.lng === location?.lng;
        if (sameLocation && prev.note === data.note) return prev;
        return { ...prev, location, note: data.note };
      });
    };
    void refresh();
    const channel = supabase
      .channel(`bhw-incident:${activeIncidentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "incidents",
          filter: `id=eq.${activeIncidentId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    const poll = window.setInterval(() => void refresh(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [activeIncidentId]);

  useEffect(() => {
    const supabase = createClient();
    void loadRinging();
    let timer: number | null = null;
    const reload = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRinging(), 250);
    };
    // New SOS (INSERT) rings; another BHW accepting (UPDATE) clears it;
    // a household call_started/ended event drives call-back cards.
    const channel = supabase
      .channel("bhw-call-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, reload)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incident_events" },
        reload,
      )
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
    setNotice(null);
    if (callLiveRef.current && info.incidentId !== activeIdRef.current) {
      setNotice("Finish your current call first, then accept this one.");
      return;
    }
    // Call-back on the incident already open here: just rejoin.
    if (info.incidentId === activeIdRef.current) {
      setIncoming((list) => list.filter((c) => c.incidentId !== info.incidentId));
      callBack();
      return;
    }
    setAnsweringId(info.incidentId);
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
      location: LatLng | null;
    };
    setIncoming((list) => list.filter((c) => c.incidentId !== info.incidentId));
    setCallOpen(true);
    setActive({
      incidentId: info.incidentId,
      patientName: data.patientName ?? info.patientName,
      patient: data.patient ?? null,
      note: data.note ?? info.note,
      location: data.location ?? null,
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
  callLiveRef.current =
    call.state === "connecting" || call.state === "ringing" || call.state === "connected";

  // Joining or leaving a call changes which call-back cards should show.
  useEffect(() => {
    void loadRinging();
  }, [call.state, loadRinging]);

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

  // Resolved or not an emergency: close it so the household's next SOS is new.
  const [closing, setClosing] = useState(false);
  async function closeIncident() {
    const id = activeIdRef.current;
    if (!id) return;
    if (!window.confirm("Close this incident? The caller's next SOS will start a new one.")) {
      return;
    }
    setClosing(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/incidents/${id}/close`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(body.error ?? "Could not close the incident.");
        return;
      }
      backToQueue();
    } catch {
      setNotice("Could not close the incident. Check your connection.");
    } finally {
      setClosing(false);
    }
  }

  // Leave the incident assigned to me (call-backs still ring here) and
  // return to the SOS queue.
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

  // Call-backs always show (loadRinging already drops them while I'm in that
  // call); new SOS cards hide once declined or once they're my open incident.
  const visibleIncoming = incoming.filter((c) =>
    c.callback
      ? true
      : !declined.has(c.incidentId) && c.incidentId !== active?.incidentId,
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={backToQueue}
                className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-slate-500 hover:text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Back to queue
              </button>
              <button
                type="button"
                onClick={() => void closeIncident()}
                disabled={closing}
                className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-emergency hover:text-emergency focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
              >
                {closing ? "Closing…" : "Close incident"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Back to queue keeps this incident yours, so call-backs still ring
            here. Close it once it&apos;s resolved or not an emergency.
          </p>
          <BhwDashboard
            key={active.incidentId}
            incident={{
              incidentId: active.incidentId,
              patient: active.patient,
              note: active.note,
              location: active.location,
            }}
          />
        </section>
      )}
    </div>
  );
}
