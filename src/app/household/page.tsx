"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, PageHeader, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident } from "@/lib/mock-data";
import { STATUS_LABEL, type IncidentStatus } from "@/lib/types";

export default function HouseholdPage() {
  const [status, setStatus] = useState<IncidentStatus | "idle">("idle");
  const patient = mockIncident.patient;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        ← All roles
      </Link>
      <PageHeader
        role="Household"
        title="Emergency SOS"
        subtitle="One tap sends your location and profile and rings the nearest BHW."
      />

      {status === "idle" ? (
        <div className="flex flex-col items-center gap-6 py-6">
          <button
            onClick={() => setStatus("sos")}
            className="flex h-56 w-56 flex-col items-center justify-center rounded-full bg-emergency text-white shadow-lg transition active:scale-95 hover:bg-emergency-dark focus:outline-none focus:ring-4 focus:ring-red-300"
            aria-label="Send SOS emergency alert"
          >
            <span className="text-5xl font-black tracking-wider">SOS</span>
            <span className="mt-2 text-sm opacity-90">Tap once for help</span>
          </button>
          <p className="max-w-sm text-center text-sm text-slate-600">
            A real BHW answers your call. The nearest ambulance is put on
            standby right away.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Card title="Status">
            <StatusStepper status={status} />
            <p className="mt-3 text-sm text-slate-700">
              Current: <strong>{STATUS_LABEL[status]}</strong>
            </p>
          </Card>

          <Card title="Live call">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Connecting to nearest BHW…
                </p>
                <p className="text-xs text-slate-500">
                  Stay on the line. Follow the BHW&apos;s guidance.
                </p>
              </div>
              <Badge tone="green">● Live</Badge>
            </div>
            <a
              href={`tel:+6321234567`}
              className="mt-3 inline-flex text-sm font-medium text-emergency hover:underline"
            >
              Weak signal? Tap to call the BHW by phone →
            </a>
          </Card>

          <Card title="Shared with the BHW">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Patient</dt>
              <dd className="font-medium">
                {patient.name}, {patient.age}
              </dd>
              <dt className="text-slate-500">Conditions</dt>
              <dd>{patient.conditions.join(", ")}</dd>
              <dt className="text-slate-500">Address</dt>
              <dd>{patient.address}</dd>
              <dt className="text-slate-500">Landmark</dt>
              <dd>{patient.landmark}</dd>
            </dl>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStatus("idle")}>
              Reset demo
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
