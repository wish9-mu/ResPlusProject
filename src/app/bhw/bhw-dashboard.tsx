"use client";

// BHW incident workspace. Live mode uses the persisted Supabase incident as
// the source of truth; demo mode keeps a local preview when Supabase is absent.
import { useMemo, useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { CallerLocationMap } from "@/components/call/CallerLocationMap";
import { HospitalSuggestions } from "@/components/call/HospitalSuggestions";
import { IncidentStatusActions } from "@/components/incident/IncidentStatusActions";
import { IncidentTriageEditor } from "@/components/incident/IncidentTriageEditor";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident, protocolCards } from "@/lib/mock-data";
import type { PatientSummary } from "@/lib/incidents/repo";
import { useIncidentRealtime } from "@/lib/incidents/use-incident-realtime";
import type { IncidentTriage } from "@/lib/incidents/triage";
import type { IncidentStatus, LatLng } from "@/lib/types";

export interface BhwIncidentView {
  incidentId: string;
  patient: PatientSummary | null; // null = unregistered caller
  note: string | null;
  location: LatLng | null;
}

interface CallerView {
  title: string;
  lines: string[];
  landmark: string | null;
  registered: boolean;
  chiefComplaint: string;
  missingFields: string[];
}

function fromIncident(incident: BhwIncidentView): CallerView {
  const p = incident.patient;
  if (!p) {
    return {
      title: "Unregistered caller",
      lines: [`Incident ${incident.incidentId.slice(0, 8)}`],
      landmark: null,
      registered: false,
      chiefComplaint: incident.note ?? "Not recorded yet. Ask on the call.",
      missingFields: [
        "patient name",
        "age",
        "what happened",
        "onset time",
        "exact location",
        "conditions & meds",
      ],
    };
  }
  return {
    title: [p.name, p.age, p.sex].filter((v) => v !== null && v !== "").join(" · "),
    lines: [
      p.conditions.join(", ") || "No conditions recorded",
      p.address ?? "No address recorded",
      `Incident ${incident.incidentId.slice(0, 8)}`,
    ],
    landmark: p.landmark,
    registered: true,
    chiefComplaint: incident.note ?? "Not recorded yet. Ask on the call.",
    missingFields: ["what happened", "onset time", "BP", "blood sugar"],
  };
}

function fromMock(): CallerView {
  const p = mockIncident.patient;
  return {
    title: `${p.name}, ${p.age} · ${p.sex}`,
    lines: [p.conditions.join(", "), p.address],
    landmark: p.landmark,
    registered: true,
    chiefComplaint: mockIncident.triage.chiefComplaint,
    missingFields: mockIncident.triage.missingFields,
  };
}

type ProtocolKey = keyof typeof protocolCards;

export function BhwDashboard({ incident }: { incident?: BhwIncidentView }) {
  const live = !!incident;
  const view = incident ? fromIncident(incident) : fromMock();
  const collaboration = useIncidentRealtime(incident?.incidentId ?? null);
  const [demoStatus, setDemoStatus] = useState<IncidentStatus>("sos");
  const status = live ? (collaboration.snapshot?.status ?? "sos") : demoStatus;

  // Live: the BHW chooses the card matching their assessment. Nothing chooses
  // a condition automatically. Demo mode starts on the sample stroke card.
  const [protocolKey, setProtocolKey] = useState<ProtocolKey | null>(
    live ? null : "stroke",
  );
  const protocol = protocolKey ? protocolCards[protocolKey] : null;

  const triagePrefill = useMemo<Partial<IncidentTriage> | undefined>(() => {
    if (!incident) return undefined;
    const p = incident.patient;
    const conditions = p?.conditions.join(", ") ?? "";
    const meds = p?.meds.join(", ") ?? "";
    return {
      patientName: p?.name ?? "",
      age: p?.age ?? null,
      chiefComplaint: incident.note ?? "",
      exactLocation:
        p?.address ??
        (incident.location
          ? `${incident.location.lat.toFixed(6)}, ${incident.location.lng.toFixed(6)}`
          : ""),
      conditionsAndMeds: [conditions, meds && `Medicines: ${meds}`]
        .filter(Boolean)
        .join("; "),
      allergies: p?.allergies.join(", ") ?? "",
    };
  }, [incident]);

  return (
    <div className="space-y-4">
      <Card title="Status">
        <StatusStepper status={status} />
        {live && (
          <p className="mt-2 text-xs text-slate-500">
            {collaboration.loading
              ? "Loading shared status…"
              : "Saved in Res+ and shared live with the household and assigned ER."}
          </p>
        )}
        {collaboration.error && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {collaboration.error}
          </p>
        )}
      </Card>

      <Card title={live ? "Caller" : "Patient & location"}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p className="text-base font-semibold text-slate-900">{view.title}</p>
            {view.lines.map((line) => (
              <p key={line} className="text-slate-600">
                {line}
              </p>
            ))}
            {view.landmark && <p className="text-slate-500">📍 {view.landmark}</p>}
          </div>
          {view.registered ? (
            <Badge tone="green">Enrolled</Badge>
          ) : (
            <Badge tone="amber">Unregistered</Badge>
          )}
        </div>
      </Card>

      {incident && (
        <Card title="Caller location">
          <CallerLocationMap location={incident.location} />
        </Card>
      )}

      {status !== "sos" && (
        <Card title="Protocol card">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(protocolCards) as ProtocolKey[]).map((key) => (
              <Button
                key={key}
                variant={protocolKey === key ? "danger" : "outline"}
                className="px-3 py-1.5 text-xs"
                onClick={() => setProtocolKey(key)}
              >
                {protocolCards[key].condition}
              </Button>
            ))}
          </div>
          {protocol ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{protocol.condition}</h3>
                {protocol.reviewed ? (
                  <Badge tone="green">Clinician-reviewed</Badge>
                ) : (
                  <Badge tone="amber">Review pending</Badge>
                )}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {protocol.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-red-700">
                  {protocol.doNot.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Pick the clinician-reviewed card matching your assessment.
            </p>
          )}
        </Card>
      )}

      {live ? (
        <Card title="Shared triage card">
          {collaboration.snapshot ? (
            <IncidentTriageEditor
              incidentId={incident.incidentId}
              snapshot={collaboration.snapshot}
              prefill={triagePrefill}
              onSaved={collaboration.refresh}
            />
          ) : (
            <p className="text-sm text-slate-500">Loading the shared card…</p>
          )}
        </Card>
      ) : status !== "sos" ? (
        <Card title="Triage card (demo)">
          <p className="text-sm text-slate-700">{view.chiefComplaint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.missingFields.map((field) => (
              <Badge key={field} tone="amber">
                {field}
              </Badge>
            ))}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setDemoStatus("sos")}>
            Reset demo
          </Button>
        </Card>
      ) : null}

      {live && collaboration.snapshot ? (
        <IncidentStatusActions
          incidentId={incident.incidentId}
          status={status}
          role="bhw"
          onUpdated={collaboration.refresh}
        />
      ) : (
        <DemoStatusAction status={status} onUpdate={setDemoStatus} />
      )}

      {status === "transporting" && (
        <Card title="Nearest hospitals">
          <HospitalSuggestions
            origin={incident?.location ?? mockIncident.location}
            incidentId={incident?.incidentId}
            assignedHospitalId={collaboration.snapshot?.assignedHospitalId}
            onHospitalAssigned={collaboration.refresh}
          />
        </Card>
      )}
    </div>
  );
}

function DemoStatusAction({
  status,
  onUpdate,
}: {
  status: IncidentStatus;
  onUpdate: (status: IncidentStatus) => void;
}) {
  const action: Partial<Record<IncidentStatus, { next: IncidentStatus; label: string }>> = {
    sos: { next: "confirmed", label: "Confirm emergency → dispatch ambulance" },
    confirmed: { next: "bhw_on_scene", label: "I'm with the patient" },
    bhw_on_scene: { next: "ambulance_on_scene", label: "Ambulance arrived" },
    ambulance_on_scene: { next: "transporting", label: "Patient picked up" },
  };
  const current = action[status];
  if (!current) return null;
  return (
    <Card title="Demo status action">
      <Button variant="danger" full onClick={() => onUpdate(current.next)}>
        {current.label}
      </Button>
    </Card>
  );
}
