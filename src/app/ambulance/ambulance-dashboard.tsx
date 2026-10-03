"use client";

import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { mockIncident } from "@/lib/mock-data";
import { formatEta } from "@/lib/utils";
import type { IncidentStatus } from "@/lib/types";

const trafficTone = {
  light: "green",
  moderate: "amber",
  heavy: "red",
} as const;

export function AmbulanceDashboard() {
  const incident = mockIncident;
  const [status, setStatus] = useState<IncidentStatus>("ambulance_on_scene");
  const [unstable, setUnstable] = useState(false);
  const [pickedHospital, setPickedHospital] = useState<string | null>(null);
  const [pickedRoute, setPickedRoute] = useState<string>(
    incident.routes.find((r) => r.isSelected)?.id ?? incident.routes[0].id,
  );

  // Unstable toggle → prefer nearest ER for stabilization (FLOW.md step 5).
  const rankedHospitals = [...incident.hospitals]
    .filter((h) => !h.isDiverting)
    .sort((a, b) =>
      unstable
        ? a.etaSeconds - b.etaSeconds
        : b.capabilities.length - a.capabilities.length,
    );

  return (
    <div className="space-y-4">
      <Card title="Status">
        <StatusStepper status={status} />
      </Card>

      <Card title="Destination rule">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">
            Patient unstable (airway, arrest, uncontrolled bleeding)?
            <br />
            <span className="text-xs text-slate-500">
              On → recommend nearest ER for stabilization. Off → nearest capable
              hospital.
            </span>
          </span>
          <button
            onClick={() => setUnstable((v) => !v)}
            role="switch"
            aria-checked={unstable}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              unstable ? "bg-emergency" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                unstable ? "left-6" : "left-1"
              }`}
            />
          </button>
        </label>
      </Card>

      <Card title="Recommended hospitals">
        <ul className="space-y-2">
          {rankedHospitals.map((h, i) => (
            <li
              key={h.id}
              className={`rounded-lg border p-3 ${
                pickedHospital === h.id
                  ? "border-emergency bg-red-50"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {i === 0 && (
                      <Badge tone="blue">
                        {unstable ? "Nearest ER" : "Recommended"}
                      </Badge>
                    )}{" "}
                    {h.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {h.level} · {h.capabilities.join(", ") || "no advanced"} ·{" "}
                    {h.bedsAvailable} beds
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{h.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {formatEta(h.etaSeconds)}
                  </p>
                  <Button
                    variant={pickedHospital === h.id ? "danger" : "outline"}
                    className="mt-1 px-3 py-1 text-xs"
                    onClick={() => setPickedHospital(h.id)}
                  >
                    {pickedHospital === h.id ? "Picked" : "Pick"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Routes & traffic">
        <ul className="space-y-2">
          {incident.routes.map((r) => (
            <li
              key={r.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                pickedRoute === r.id
                  ? "border-emergency bg-red-50"
                  : "border-slate-200"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{r.label}</p>
                <p className="text-xs text-slate-500">
                  {(r.distanceM / 1000).toFixed(1)} km ·{" "}
                  <Badge tone={trafficTone[r.traffic]}>{r.traffic}</Badge>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">
                  {formatEta(r.etaSeconds)}
                </span>
                <Button
                  variant={pickedRoute === r.id ? "danger" : "outline"}
                  className="px-3 py-1 text-xs"
                  onClick={() => setPickedRoute(r.id)}
                >
                  {pickedRoute === r.id ? "Selected" : "Use"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <a
          href="https://www.google.com/maps/dir/?api=1&destination=QC+General+Hospital"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-emergency hover:underline"
        >
          Navigate (opens Google Maps) →
        </a>
      </Card>

      <Button
        variant="danger"
        full
        disabled={!pickedHospital}
        onClick={() => setStatus("transporting")}
      >
        {pickedHospital
          ? "Confirm hospital & start transport"
          : "Pick a hospital first"}
      </Button>
    </div>
  );
}
