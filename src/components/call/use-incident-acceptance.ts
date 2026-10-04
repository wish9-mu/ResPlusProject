"use client";

// Household side: watches its own incident. `accepted` flips once a BHW
// accepts it (assigned_bhw set); `closed` flips if the BHW closes it.
// Realtime gives the instant update; a slow poll backs it up in case the
// realtime socket is blocked or drops.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 4000;

interface Row {
  assigned_bhw?: string | null;
  status?: string;
}

export function useIncidentAcceptance(incidentId: string | null): {
  accepted: boolean;
  closed: boolean;
} {
  const [accepted, setAccepted] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    setAccepted(false);
    setClosed(false);
    if (!incidentId) return;

    const supabase = createClient();
    let stopped = false;
    const apply = (row: Row | null) => {
      if (stopped || !row) return;
      if (row.assigned_bhw) setAccepted(true);
      if (row.status === "closed") {
        setClosed(true);
        stopped = true; // nothing more to watch
      }
    };

    const check = async () => {
      // RLS: the reporter can read their own incident (incidents_reporter_read).
      const { data } = await supabase
        .from("incidents")
        .select("assigned_bhw,status")
        .eq("id", incidentId)
        .maybeSingle<Row>();
      apply(data);
    };

    void check();
    const poll = window.setInterval(() => {
      if (stopped) window.clearInterval(poll);
      else void check();
    }, POLL_MS);

    const channel = supabase
      .channel(`incident-watch:${incidentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "incidents",
          filter: `id=eq.${incidentId}`,
        },
        (change) => apply(change.new as Row),
      )
      .subscribe();

    return () => {
      stopped = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [incidentId]);

  return { accepted, closed };
}
