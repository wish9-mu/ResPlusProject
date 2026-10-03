"use client";

import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { StatusStepper } from "@/components/status-stepper";
import { IncidentMap } from "@/components/incident-map";
import { mockIncident } from "@/lib/mock-data";
import { useRoutes, type RoutesStatus } from "@/lib/routing/use-routes";
import { formatEta } from "@/lib/utils";
import {
  STATUS_ORDER,
  type IncidentStatus,
  type LatLng,
  type RouteOption,
} from "@/lib/types";

const trafficTone = {
  light: "green",
  moderate: "amber",
  heavy: "red",
  unknown: "slate",
} as const;

type Leg = "to_scene" | "to_hospital";

// FLOW.md: until the crew reaches the patient, the trip is ambulance -> scene.
// From "ambulance_on_scene" on, it is scene -> hospital.
function legFor(status: IncidentStatus): Leg {
  return STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf("ambulance_on_scene")
    ? "to_scene"
    : "to_hospital";
}

function fastestRouteId(routes: RouteOption[]): string | null {
  if (routes.length === 0) return null;
  return routes.reduce((best, r) => (r.etaSeconds < best.etaSeconds ? r : best)).id;
}

// Turn-by-turn stays in Google Maps (FLOW.md step 7). It plans its own route
// with live traffic, and the URL needs no API key.
function navigateUrl(to: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving&dir_action=navigate`;
}

const etaText = (route: RouteOption) =>
  `${route.estimated ? "~" : ""}${formatEta(route.etaSeconds)}`;

export function AmbulanceDashboard() {
  const incident = mockIncident;
  // The demo starts right after dispatch, with the crew heading to the patient.
  const [status, setStatus] = useState<IncidentStatus>("confirmed");
  const [unstable, setUnstable] = useState(false);
  const [pickedHospital, setPickedHospital] = useState<string | null>(null);

  // Unstable toggle → prefer nearest ER for stabilization (FLOW.md step 5).
  const rankedHospitals = [...incident.hospitals]
    .filter((h) => !h.isDiverting)
    .sort((a, b) =>
      unstable
        ? a.etaSeconds - b.etaSeconds
        : b.capabilities.length - a.capabilities.length,
    );

  const leg = legFor(status);
  const scene = incident.location;
  // Before a hospital is picked, preview the route to the top recommendation.
  const targetHospital =
    leg === "to_hospital"
      ? (rankedHospitals.find((h) => h.id === pickedHospital) ?? rankedHospitals[0] ?? null)
      : null;
  const origin = leg === "to_scene" ? (incident.ambulance?.location ?? null) : scene;
  const destination = leg === "to_scene" ? scene : (targetHospital?.location ?? null);

  const routes = useRoutes(origin, destination);
  // The crew's route choice belongs to one leg. A new leg (or hospital) starts
  // on the fastest route; a refresh of the same leg keeps their choice.
  const [selection, setSelection] = useState<{ legKey: string | null; routeId: string | null }>(
    { legKey: null, routeId: null },
  );
  useEffect(() => {
    setSelection((prev) =>
      prev.legKey === routes.legKey && routes.routes.some((r) => r.id === prev.routeId)
        ? prev
        : { legKey: routes.legKey, routeId: fastestRouteId(routes.routes) },
    );
  }, [routes.legKey, routes.routes]);
  const selectedRouteId = selection.routeId;
  const setSelectedRouteId = (routeId: string) =>
    setSelection({ legKey: routes.legKey, routeId });
  const selectedRoute = routes.routes.find((r) => r.id === selectedRouteId) ?? null;
  const fastestId = fastestRouteId(routes.routes);

  const destinationName = leg === "to_scene" ? "patient" : (targetHospital?.name ?? "hospital");
  const fullViewTitle = `To ${destinationName}${
    selectedRoute ? ` · ${selectedRoute.label} · ${etaText(selectedRoute)}` : ""
  }`;

  return (
    <div className="space-y-4">
      <Card title="Status">
        <StatusStepper status={status} />
      </Card>

      {leg === "to_scene" && (
        <Card title="Heading to patient">
          <p className="text-base font-semibold text-slate-900">
            {incident.patient.name}, {incident.patient.age} · {incident.patient.sex}
          </p>
          <p className="text-sm text-slate-600">{incident.triage.suspected}</p>
          <p className="mt-1 text-sm text-slate-600">{incident.patient.address}</p>
          <p className="text-sm text-slate-500">📍 {incident.patient.landmark}</p>
          {incident.bhw && (
            <p className="mt-2 text-sm text-slate-600">
              <span aria-hidden>🧑‍⚕️ </span>
              {incident.bhw.name} is heading to the scene.
            </p>
          )}
          <Button
            variant="danger"
            full
            className="mt-3"
            onClick={() => setStatus("ambulance_on_scene")}
          >
            Arrived on scene
          </Button>
        </Card>
      )}

      {leg === "to_hospital" && (
        <>
          <Card title="Destination rule">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">
                Patient unstable (airway, arrest, uncontrolled bleeding)?
                <br />
                <span className="text-xs text-slate-500">
                  On → recommend nearest ER for stabilization. Off → nearest
                  capable hospital.
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
        </>
      )}

      <Card title={leg === "to_scene" ? "Route to patient" : "Route to hospital"}>
        <p className="mb-3 text-sm text-slate-700">
          <span className="text-slate-500">To: </span>
          <span className="font-medium text-slate-900">
            {leg === "to_scene"
              ? `${incident.patient.name} (scene)`
              : (targetHospital?.name ?? "No hospital available")}
          </span>
          {leg === "to_hospital" && targetHospital && !pickedHospital && (
            <span className="text-slate-500"> · preview of the top recommendation</span>
          )}
        </p>

        <IncidentMap
          scene={scene}
          ambulance={leg === "to_scene" ? (incident.ambulance?.location ?? null) : null}
          bhw={leg === "to_scene" ? (incident.bhw?.location ?? null) : null}
          hospitals={leg === "to_hospital" ? rankedHospitals : []}
          pickedHospitalId={pickedHospital}
          routes={routes.routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          viewKey={routes.legKey ?? leg}
          allowFullView
          fullViewTitle={fullViewTitle}
        />

        <RoutesStatusLine
          status={routes.status}
          computedAt={routes.computedAt}
          hasDestination={destination !== null}
          onRefresh={routes.refresh}
        />

        {routes.routes.length > 0 && (
          <ul className="mt-2 space-y-2">
            {routes.routes.map((r) => {
              const selected = r.id === selectedRouteId;
              return (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    selected ? "border-blue-700 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                      {r.label}
                      {r.id === fastestId && routes.routes.length > 1 && (
                        <Badge tone="blue">Fastest</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {(r.distanceM / 1000).toFixed(1)} km ·
                      {r.estimated ? (
                        <Badge tone="slate">est.</Badge>
                      ) : (
                        <Badge tone={trafficTone[r.traffic]}>{r.traffic} traffic</Badge>
                      )}
                      {r.trafficDelaySeconds >= 60 && (
                        <span>
                          +{Math.round(r.trafficDelaySeconds / 60)} min from incidents
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold text-slate-900">{etaText(r)}</span>
                    <Button
                      variant={selected ? "primary" : "outline"}
                      className="px-3 py-1 text-xs"
                      onClick={() => setSelectedRouteId(r.id)}
                    >
                      {selected ? "Selected" : "Use"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {destination && (
          <a
            href={navigateUrl(destination)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex text-sm font-medium text-emergency hover:underline"
          >
            Navigate (opens Google Maps) →
          </a>
        )}
      </Card>

      {leg === "to_hospital" &&
        (status === "transporting" ? (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-center text-sm font-medium text-green-800"
          >
            Transporting to {targetHospital?.name ?? "the hospital"}.
          </p>
        ) : (
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
        ))}
    </div>
  );
}

function RoutesStatusLine({
  status,
  computedAt,
  hasDestination,
  onRefresh,
}: {
  status: RoutesStatus;
  computedAt: string | null;
  hasDestination: boolean;
  onRefresh: () => void;
}) {
  let text = "";
  if (!hasDestination) {
    text = "No location to route to yet. Use the address and landmark.";
  } else if (status === "loading") {
    text = "Finding routes with live traffic…";
  } else if (status === "live") {
    const time = computedAt
      ? new Date(computedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
    text = `Live-traffic ETAs from TomTom · updated ${time}`;
  } else if (status === "estimate") {
    text = "Live routing is unavailable. Showing a rough straight-line estimate.";
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-xs">
      <p
        aria-live="polite"
        className={status === "estimate" ? "text-amber-700" : "text-slate-500"}
      >
        {text}
      </p>
      {hasDestination && status !== "loading" && (
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-[44px] rounded-lg px-2 font-medium text-slate-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {status === "estimate" ? "Try again" : "Refresh routes"}
        </button>
      )}
    </div>
  );
}
