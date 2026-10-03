"use client";

// Household side: watches its own incident until a BHW accepts it
// (incidents.assigned_bhw is set). Realtime gives the instant update; a slow
// poll backs it up in case the realtime socket is blocked or drops.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 4000;

export function useIncidentAcceptance(incidentId: string | null): {
  accepted: boolean;
} {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(false);
    if (!incidentId) return;

    const supabase = createClient();
    let done = false;
    const markIfAssigned = (row: { assigned_bhw?: string | null } | null) => {
      if (!done && row?.assigned_bhw) {
        done = true;
        setAccepted(true);
      }
    };

    const check = async () => {
      // RLS: the reporter can read their own incident (incidents_reporter_read).
      const { data } = await supabase
        .from("incidents")
        .select("assigned_bhw")
        .eq("id", incidentId)
        .maybeSingle<{ assigned_bhw: string | null }>();
      markIfAssigned(data);
    };

    void check();
    const poll = window.setInterval(() => {
      if (done) window.clearInterval(poll);
      else void check();
    }, POLL_MS);

    const channel = supabase
      .channel(`incident-accept:${incidentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "incidents",
          filter: `id=eq.${incidentId}`,
        },
        (change) => markIfAssigned(change.new as { assigned_bhw?: string | null }),
      )
      .subscribe();

    return () => {
      done = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [incidentId]);

  return { accepted };
}
