"use client";

// BHW incident workspace: who called, confirm emergency, protocol card, and
// what still needs to be asked.
//   - With `incident`: the real SOS this BHW accepted (live mode).
//   - Without it: the original demo patient, used only in demo mode
//     (Supabase not configured), so the screen stays previewable.
// Status changes here are local for now; they are not yet saved to Supabase.
import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident, protocolCards } from "@/lib/mock-data";
import type { PatientSummary } from "@/lib/incidents/repo";
import type { IncidentStatus, LatLng } from "@/lib/types";
import { CallerLocationMap } from "@/components/call/CallerLocationMap";

export interface BhwIncidentView {
  incidentId: string;
  patient: PatientSummary | null; // null = unregistered caller
  note: string | null;
  location: LatLng | null; // caller's SOS GPS fix, null if not shared
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
  const [status, setStatus] = useState<IncidentStatus>("sos");
  // Live: the BHW picks the card that matches what they hear (no default, so
  // no protocol is shown for a condition nobody has assessed). Demo: stroke.
  const [protocolKey, setProtocolKey] = useState<ProtocolKey | null>(
    live ? null : "stroke",
  );
  const protocol = protocolKey ? protocolCards[protocolKey] : null;

  return (
    <div className="space-y-4">
      <Card title="Status">
        <StatusStepper status={status} />
        {live && (
          <p className="mt-2 text-xs text-slate-400">
            Status updates on this screen are not saved yet.
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

      {status === "sos" && (
        <Card>
          <p className="mb-3 text-sm text-slate-700">
            Safety rule: dispatch waits on a <strong>person</strong>, never on
            AI. Confirm once you&apos;ve verified the emergency on the call.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" full onClick={() => setStatus("confirmed")}>
              Confirm emergency → dispatch ambulance
            </Button>
            <Button variant="outline">Not an emergency</Button>
          </div>
        </Card>
      )}

      {status !== "sos" && (
        <>
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
                  {protocol.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <div className="mt-3 rounded-lg bg-red-50 p-3">
                  <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-red-700">
                    {protocol.doNot.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Pick the card that matches what you hear on the call.
              </p>
            )}
          </Card>

          <Card title={live ? "Triage card (you fill in)" : "Triage card (AI-assisted, you verify)"}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Chief complaint</dt>
                <dd className="text-right font-medium">{view.chiefComplaint}</dd>
              </div>
              {!live && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Suspected</dt>
                  <dd className="font-medium">{mockIncident.triage.suspected}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Missing info — ask before handoff
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.missingFields.map((f) => (
                <Badge key={f} tone="amber">
                  {f}
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setStatus("bhw_on_scene")}>
                Mark &quot;on scene&quot;
              </Button>
              {!live && (
                <Button variant="ghost" onClick={() => setStatus("sos")}>
                  Reset demo
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
