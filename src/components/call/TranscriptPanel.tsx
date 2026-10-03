"use client";

// Live transcript for the BHW. Final lines come from transcript_segments via
// Supabase Realtime; the in-progress line comes straight from the STT stream.
// The transcript is a convenience: the BHW still decides everything, and
// nothing here is medical advice.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type TranscriptStatus = "off" | "starting" | "live" | "unavailable" | "save_failed";

interface Line {
  id: string;
  speaker: string | null;
  text: string;
  created_at: string;
}

const SPEAKER_LABEL: Record<string, string> = {
  household: "Household",
  bhw: "BHW",
};

export function TranscriptPanel({
  incidentId,
  status,
  partial,
}: {
  incidentId: string;
  status: TranscriptStatus;
  partial: { speaker: string; text: string } | null;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const add = (incoming: Line[]) =>
      setLines((prev) => {
        const ids = new Set(prev.map((l) => l.id));
        const merged = [...prev, ...incoming.filter((l) => !ids.has(l.id))];
        return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
      });

    void supabase
      .from("transcript_segments")
      .select("id,speaker,text,created_at")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        if (!cancelled && data) add(data as Line[]);
      });

    const channel = supabase
      .channel(`transcript:${incidentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transcript_segments",
          filter: `incident_id=eq.${incidentId}`,
        },
        (change) => add([change.new as Line]),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [incidentId]);

  // Keep the newest line in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, partial]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Live transcript
        </h3>
        <StatusNote status={status} />
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Call transcript"
        className="max-h-64 space-y-2 overflow-y-auto px-3 py-2 text-sm"
      >
        {lines.length === 0 && !partial && (
          <p className="py-2 text-slate-400">
            {status === "unavailable"
              ? "Transcript unavailable for this call. Type notes in the triage card."
              : "Waiting for speech…"}
          </p>
        )}
        {lines.map((line) => (
          <TranscriptLine key={line.id} speaker={line.speaker} text={line.text} />
        ))}
        {partial && (
          <TranscriptLine speaker={partial.speaker} text={partial.text} pending />
        )}
      </div>
    </div>
  );
}

function TranscriptLine({
  speaker,
  text,
  pending,
}: {
  speaker: string | null;
  text: string;
  pending?: boolean;
}) {
  const label = SPEAKER_LABEL[speaker ?? ""] ?? "Unknown";
  return (
    <p className={cn(pending && "italic text-slate-400")}>
      <span
        className={cn(
          "mr-1.5 font-semibold",
          speaker === "household" ? "text-emergency" : "text-slate-900",
          pending && "text-slate-400",
        )}
      >
        {label}:
      </span>
      {text}
    </p>
  );
}

function StatusNote({ status }: { status: TranscriptStatus }) {
  const map: Record<TranscriptStatus, { text: string; tone: string }> = {
    off: { text: "Off", tone: "text-slate-400" },
    starting: { text: "Starting…", tone: "text-slate-500" },
    live: { text: "● Live", tone: "text-green-700" },
    unavailable: { text: "Unavailable", tone: "text-amber-700" },
    save_failed: { text: "Saving failed, retrying", tone: "text-amber-700" },
  };
  const s = map[status];
  return <span className={cn("text-xs font-medium", s.tone)}>{s.text}</span>;
}
