"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, PageHeader, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident } from "@/lib/mock-data";
import { formatEta } from "@/lib/utils";
import type { IncidentStatus } from "@/lib/types";

type Decision = "pending" | "accepted" | "diverted";

export default function ErPage() {
  const incident = mockIncident;
  const [status, setStatus] = useState<IncidentStatus>("transporting");
  const [decision, setDecision] = useState<Decision>("pending");
  const [beds, setBeds] = useState(incident.hospitals[0].bedsAvailable);
  const destination = incident.hospitals[0];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        ← All roles
      </Link>
      <PageHeader
        role="ER staff"
        title="Incoming patient"
        subtitle="Accept to prepare, or divert. No response in 2 min auto-escalates to the next capable hospital."
      />

      <div className="space-y-4">
        <Card title="Status">
          <StatusStepper status={status} />
        </Card>

        <Card title="Incoming to this ER">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="text-base font-semibold text-slate-900">
                {incident.patient.name}, {incident.patient.age} ·{" "}
                {incident.patient.sex}
              </p>
              <p className="text-slate-600">{incident.triage.suspected}</p>
              <p className="text-slate-600">
                {incident.triage.chiefComplaint}
              </p>
              <p className="text-slate-500">
                Conditions: {incident.patient.conditions.join(", ")}
              </p>
            </div>
            <div className="text-right">
              <Badge tone={incident.unstable ? "red" : "amber"}>
                {incident.unstable ? "Unstable" : "Stable"}
              </Badge>
              <p className="mt-2 text-xs text-slate-500">ETA</p>
              <p className="text-lg font-bold text-slate-900">
                {formatEta(destination.etaSeconds)}
              </p>
            </div>
          </div>
        </Card>

        {decision === "pending" && (
          <Card>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
              ⏱ Auto-escalation in 2:00 if no response. The ambulance never
              stops to wait.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="danger"
                full
                onClick={() => {
                  setDecision("accepted");
                  setStatus("transporting");
                }}
              >
                Accept & prepare (CT, neuro on-call)
              </Button>
              <Button
                variant="outline"
                full
                onClick={() => setDecision("diverted")}
              >
                Divert → re-match next capable
              </Button>
            </div>
          </Card>
        )}

        {decision === "accepted" && (
          <Card title="Preparing">
            <p className="text-sm text-green-700">
              ✓ Accepted. Prep team notified. CT and neuro on-call alerted.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setStatus("arrived")}
            >
              Mark arrived & handoff
            </Button>
          </Card>
        )}

        {decision === "diverted" && (
          <Card title="Diverted">
            <p className="text-sm text-amber-700">
              Diverted. Res+ is re-matching to the next capable hospital and
              notifying the crew.
            </p>
          </Card>
        )}

        <Card title="Bed & capability status (you update)">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {destination.name}
              </p>
              <p className="text-xs text-slate-500">
                {destination.capabilities.join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="px-3 py-1"
                onClick={() => setBeds((b) => Math.max(0, b - 1))}
              >
                −
              </Button>
              <span className="w-16 text-center text-sm font-semibold">
                {beds} beds
              </span>
              <Button
                variant="ghost"
                className="px-3 py-1"
                onClick={() => setBeds((b) => b + 1)}
              >
                +
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Seed values only. No public live bed API in PH; ER staff keep this
            current.
          </p>
        </Card>

        <Card title="Case timeline (audit log)">
          <ol className="space-y-2 text-sm">
            {incident.timeline.map((e, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emergency" />
                <span className="font-medium text-slate-800">{e.type}</span>
                <span className="text-slate-400">· {e.actor}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              Further events append here through close.
            </li>
          </ol>
        </Card>
      </div>
    </main>
  );
}
