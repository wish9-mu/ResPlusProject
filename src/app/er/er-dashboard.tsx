"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { IncidentStatusActions } from "@/components/incident/IncidentStatusActions";
import { IncidentTriageEditor } from "@/components/incident/IncidentTriageEditor";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { useIncidentRealtime } from "@/lib/incidents/use-incident-realtime";
import type { IncidentTriage } from "@/lib/incidents/triage";
import type { IncidentStatus } from "@/lib/types";

const POLL_MS = 5000;

interface ErIncidentRow {
  id: string;
  status: IncidentStatus;
  patient_id: string | null;
  note: string | null;
  unstable: boolean;
  created_at: string;
}

interface ErIncident extends ErIncidentRow {
  patient: {
    name: string;
    age: number | null;
    sex: "F" | "M" | null;
    conditions: string[];
    meds: string[];
    allergies: string[];
    address: string | null;
    landmark: string | null;
  } | null;
}

export function ErDashboard({ demo = false }: { demo?: boolean }) {
  if (demo) return <DemoErDashboard />;
  return <LiveErDashboard />;
}

function LiveErDashboard() {
  const [hospital, setHospital] = useState<{ id: string; name: string } | null>(null);
  const [incidents, setIncidents] = useState<ErIncident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("hospital_id")
      .eq("id", user.id)
      .maybeSingle<{ hospital_id: string | null }>();
    if (!profile?.hospital_id) {
      setError("This ER account is not linked to a hospital.");
      setLoading(false);
      return;
    }

    const [hospitalResult, incidentResult] = await Promise.all([
      supabase
        .from("hospitals")
        .select("id,name")
        .eq("id", profile.hospital_id)
        .maybeSingle<{ id: string; name: string }>(),
      supabase
        .from("incidents")
        .select("id,status,patient_id,note,unstable,created_at")
        .eq("assigned_hospital", profile.hospital_id)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(25)
        .returns<ErIncidentRow[]>(),
    ]);

    if (hospitalResult.error || incidentResult.error) {
      setError("Could not load this hospital's incoming patients.");
      setLoading(false);
      return;
    }
    if (hospitalResult.data) setHospital(hospitalResult.data);

    const rows = incidentResult.data ?? [];
    const patientIds = rows.map((row) => row.patient_id).filter((id): id is string => !!id);
    const patientMap = new Map<string, ErIncident["patient"]>();
    if (patientIds.length) {
      const { data: patients } = await supabase
        .from("patients")
        .select("id,name,age,sex,conditions,meds,allergies,address,landmark")
        .in("id", patientIds)
        .returns<
          Array<NonNullable<ErIncident["patient"]> & { id: string }>
        >();
      for (const patient of patients ?? []) patientMap.set(patient.id, patient);
    }

    const next = rows.map((row) => ({
      ...row,
      patient: row.patient_id ? (patientMap.get(row.patient_id) ?? null) : null,
    }));
    setIncidents(next);
    setSelectedId((current) =>
      current && next.some((row) => row.id === current)
        ? current
        : (next[0]?.id ?? null),
    );
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void load();
    const channel = supabase
      .channel("er-assigned-incidents")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        () => void load(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });
    const poll = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const selected = incidents.find((row) => row.id === selectedId) ?? null;

  if (loading) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-slate-500">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Loading incoming patients…
      </p>
    );
  }

  if (error) {
    return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <Building2 aria-hidden className="h-5 w-5 text-emergency" />
          <div>
            <p className="font-semibold text-slate-900">{hospital?.name ?? "Your hospital"}</p>
            <p className="text-sm text-slate-500">
              {incidents.length
                ? `${incidents.length} active incoming patient${incidents.length === 1 ? "" : "s"}`
                : "No incoming patients assigned to this hospital."}
            </p>
          </div>
        </div>
      </Card>

      {incidents.length > 1 && (
        <Card title="Incoming queue">
          <div className="flex flex-wrap gap-2">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                onClick={() => setSelectedId(incident.id)}
                className={`min-h-[44px] rounded-lg border px-3 text-left text-sm ${
                  selectedId === incident.id
                    ? "border-emergency bg-red-50 text-emergency"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <span className="block font-semibold">
                  {incident.patient?.name ?? "Unregistered caller"}
                </span>
                <span className="font-mono text-xs">{incident.id.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {selected && <LiveErIncident key={selected.id} incident={selected} />}
    </div>
  );
}

function LiveErIncident({ incident }: { incident: ErIncident }) {
  const collaboration = useIncidentRealtime(incident.id);
  const snapshot = collaboration.snapshot;
  const patient = incident.patient;
  const prefill = useMemo<Partial<IncidentTriage>>(
    () => ({
      patientName: patient?.name ?? "",
      age: patient?.age ?? null,
      chiefComplaint: incident.note ?? "",
      exactLocation: [patient?.address, patient?.landmark].filter(Boolean).join(" · "),
      conditionsAndMeds: [
        patient?.conditions.join(", "),
        patient?.meds.length ? `Medicines: ${patient.meds.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      allergies: patient?.allergies.join(", ") ?? "",
    }),
    [patient, incident.note],
  );

  return (
    <section className="space-y-4" aria-label="Selected incoming patient">
      <Card title="Incoming to this ER">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">
              {patient?.name ?? "Unregistered patient"}
              {patient?.age !== null && patient?.age !== undefined ? `, ${patient.age}` : ""}
              {patient?.sex ? ` · ${patient.sex}` : ""}
            </p>
            <p className="font-mono text-xs text-slate-500">
              Incident {incident.id.slice(0, 8)}
            </p>
            {incident.note && <p className="mt-2 text-sm text-slate-600">{incident.note}</p>}
          </div>
          <Badge tone={(snapshot?.unstable ?? incident.unstable) ? "red" : "amber"}>
            {(snapshot?.unstable ?? incident.unstable) ? "Unstable" : "No unstable flag"}
          </Badge>
        </div>
      </Card>

      <Card title="Status">
        <StatusStepper status={snapshot?.status ?? incident.status} />
        <p className="mt-2 text-xs text-slate-500">
          Shared live with the BHW and household.
        </p>
      </Card>

      <Card title="Shared triage card">
        {snapshot ? (
          <IncidentTriageEditor
            incidentId={incident.id}
            snapshot={snapshot}
            prefill={prefill}
            onSaved={collaboration.refresh}
          />
        ) : (
          <p className="text-sm text-slate-500">Loading the shared card…</p>
        )}
      </Card>

      {snapshot && (
        <IncidentStatusActions
          incidentId={incident.id}
          status={snapshot.status}
          role="er"
          onUpdated={collaboration.refresh}
        />
      )}
    </section>
  );
}

function DemoErDashboard() {
  const [status, setStatus] = useState<IncidentStatus>("transporting");
  return (
    <div className="space-y-4">
      <Card title="Demo incoming patient">
        <p className="font-semibold text-slate-900">
          {mockIncident.patient.name}, {mockIncident.patient.age}
        </p>
        <p className="text-sm text-slate-600">{mockIncident.triage.chiefComplaint}</p>
      </Card>
      <Card title="Status">
        <StatusStepper status={status} />
      </Card>
      {status === "transporting" && (
        <Button variant="danger" full onClick={() => setStatus("arrived")}>
          Patient arrived at ER
        </Button>
      )}
      {status === "arrived" && (
        <Button variant="danger" full onClick={() => setStatus("closed")}>
          Complete handoff & close
        </Button>
      )}
    </div>
  );
}
