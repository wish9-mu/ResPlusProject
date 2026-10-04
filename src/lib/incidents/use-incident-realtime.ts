"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deriveMissingFields,
  normalizeTriage,
  type IncidentTriage,
} from "@/lib/incidents/triage";
import { STATUS_ORDER, type IncidentStatus } from "@/lib/types";

const POLL_MS = 5000;

interface RawRow {
  id: string;
  status: string;
  triage: unknown;
  missing_fields: string[] | null;
  unstable: boolean;
  assigned_hospital: string | null;
  updated_at: string;
}

export interface IncidentSnapshot {
  id: string;
  status: IncidentStatus;
  triage: IncidentTriage;
  missingFields: string[];
  unstable: boolean;
  assignedHospitalId: string | null;
  updatedAt: string;
}

function toSnapshot(row: RawRow): IncidentSnapshot | null {
  if (!STATUS_ORDER.includes(row.status as IncidentStatus)) return null;
  const triage = normalizeTriage(row.triage);
  return {
    id: row.id,
    status: row.status as IncidentStatus,
    triage,
    // Derive from the validated document so legacy rows with [] aren't shown
    // as complete by mistake. The server stores the same derived list.
    missingFields: deriveMissingFields(triage),
    unstable: row.unstable === true,
    assignedHospitalId: row.assigned_hospital,
    updatedAt: row.updated_at,
  };
}

export function useIncidentRealtime(incidentId: string | null) {
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(incidentId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!incidentId) return;
    const { data, error: queryError } = await createClient()
      .from("incidents")
      .select("id,status,triage,missing_fields,unstable,assigned_hospital,updated_at")
      .eq("id", incidentId)
      .maybeSingle<RawRow>();
    if (queryError || !data) {
      setError("Could not refresh this incident.");
      setLoading(false);
      return;
    }
    const next = toSnapshot(data);
    if (!next) {
      setError("This incident has an invalid status.");
      setLoading(false);
      return;
    }
    setSnapshot(next);
    setError(null);
    setLoading(false);
  }, [incidentId]);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setLoading(Boolean(incidentId));
    if (!incidentId) return;

    const supabase = createClient();
    let cancelled = false;
    const guardedRefresh = () => {
      if (!cancelled) void refresh();
    };
    guardedRefresh();

    const channel = supabase
      .channel(`incident-collaboration:${incidentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "incidents",
          filter: `id=eq.${incidentId}`,
        },
        guardedRefresh,
      )
      .subscribe((status) => {
        // Authoritative refetch after subscription closes the initial
        // fetch/subscribe race and after reconnect catches missed updates.
        if (status === "SUBSCRIBED") guardedRefresh();
      });
    const poll = window.setInterval(guardedRefresh, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [incidentId, refresh]);

  return { snapshot, loading, error, refresh };
}
