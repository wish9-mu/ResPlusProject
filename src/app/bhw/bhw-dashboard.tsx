"use client";

import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident, protocolCards } from "@/lib/mock-data";
import type { IncidentStatus } from "@/lib/types";

export function BhwDashboard() {
  const incident = mockIncident;
  const [status, setStatus] = useState<IncidentStatus>("sos");
  const protocol = protocolCards.stroke;

  return (
    <div className="space-y-4">
      <Card title="Status">
        <StatusStepper status={status} />
      </Card>

      <Card title="Patient & location">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p className="text-base font-semibold text-slate-900">
              {incident.patient.name}, {incident.patient.age} ·{" "}
              {incident.patient.sex}
            </p>
            <p className="text-slate-600">
              {incident.patient.conditions.join(", ")}
            </p>
            <p className="text-slate-600">{incident.patient.address}</p>
            <p className="text-slate-500">📍 {incident.patient.landmark}</p>
          </div>
          <Badge tone="red">● SOS live call</Badge>
        </div>
      </Card>

      {status === "sos" && (
        <Card>
          <p className="mb-3 text-sm text-slate-700">
            Safety rule: dispatch waits on a <strong>person</strong>, never on
            AI. Confirm once you&apos;ve verified the emergency on the call.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="danger"
              full
              onClick={() => setStatus("confirmed")}
            >
              Confirm emergency → dispatch ambulance
            </Button>
            <Button variant="outline">Not an emergency</Button>
          </div>
        </Card>
      )}

      {status !== "sos" && (
        <>
          <Card title="Protocol card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {protocol.condition}
              </h3>
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
          </Card>

          <Card title="Triage card (AI-assisted, you verify)">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Chief complaint</dt>
                <dd className="text-right font-medium">
                  {incident.triage.chiefComplaint}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Suspected</dt>
                <dd className="font-medium">{incident.triage.suspected}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Missing info — fill before handoff
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {incident.triage.missingFields.map((f) => (
                <Badge key={f} tone="amber">
                  {f}
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStatus("bhw_on_scene")}
              >
                Mark &quot;on scene&quot;
              </Button>
              <Button variant="ghost" onClick={() => setStatus("sos")}>
                Reset demo
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
