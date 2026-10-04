"use client";

// Nearest hospitals from the patient's pickup point (the caller's GPS fix),
// ranked by live, traffic-aware drive time (TomTom via /api/routes).
//
// Safety (FLOW.md): this is a suggestion. The ambulance crew picks the
// hospital, and capability data isn't on file for most hospitals yet, so the
// UI says "call ahead" instead of claiming a hospital can treat the patient.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { IncidentMap } from "@/components/incident-map";
import { createClient } from "@/lib/supabase/client";
import { parseEwkbPoint } from "@/lib/geo/ewkb";
import { estimateRoute, haversineMeters } from "@/lib/routing/estimate";
import type { LatLng, RouteOption, TrafficLevel } from "@/lib/types";
import { formatEta } from "@/lib/utils";

// Straight-line pre-filter, then live routes for the nearest hospitals. A
// hospital with a configured ER account is also kept selectable so a real ER
// can receive the shared card during the demo.
const CANDIDATES = 3;
const MAX_STAFFED_EXTRAS = 3;

const trafficTone: Record<TrafficLevel, "green" | "amber" | "red" | "slate"> = {
  light: "green",
  moderate: "amber",
  heavy: "red",
  unknown: "slate",
};

interface HospitalRow {
  id: string;
  name: string;
  location: string | null;
  capabilities: string[];
  is_diverting: boolean;
}

interface Suggestion {
  id: string;
  name: string;
  location: LatLng;
  capabilities: string[];
  routes: RouteOption[]; // fastest first
  live: boolean; // false = straight-line estimate
  erStaffed: boolean;
}

async function routesTo(origin: LatLng, destination: LatLng): Promise<{
  routes: RouteOption[];
  live: boolean;
}> {
  try {
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { routes: RouteOption[] };
    if (!data.routes?.length) throw new Error("no routes");
    return {
      routes: [...data.routes].sort((a, b) => a.etaSeconds - b.etaSeconds),
      live: true,
    };
  } catch {
    // FLOW.md rule 4: never a dead end. Rough estimate, labelled as such.
    return { routes: [estimateRoute(origin, destination)], live: false };
  }
}

export function HospitalSuggestions({
  origin,
  incidentId,
  assignedHospitalId = null,
  onHospitalAssigned,
}: {
  origin: LatLng | null;
  // When present (live BHW workflow), the destination is persisted only after
  // the BHW records the ambulance crew's explicit confirmation.
  incidentId?: string;
  assignedHospitalId?: string | null;
  onHospitalAssigned?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; suggestions: Suggestion[] }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [pickedId, setPickedId] = useState<string | null>(assignedHospitalId);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const originKey = origin ? `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}` : null;

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      const supabase = createClient();
      const [hospitalResult, erResult] = await Promise.all([
        supabase
          .from("hospitals")
          .select("id,name,location,capabilities,is_diverting")
          .returns<HospitalRow[]>(),
        supabase
          .from("profiles")
          .select("hospital_id")
          .eq("role", "er")
          .not("hospital_id", "is", null)
          .returns<{ hospital_id: string | null }[]>(),
      ]);
      if (hospitalResult.error) throw hospitalResult.error;

      // Failing to load staff presence must not block hospital routing.
      const erProfiles = (erResult.data ?? []) as unknown as Array<{
        hospital_id: string | null;
      }>;
      const staffedIds = new Set(
        erProfiles
          .map((profile) => profile.hospital_id)
          .filter((id): id is string => !!id),
      );
      const ranked = (hospitalResult.data ?? [])
        .filter((h) => !h.is_diverting)
        .map((h) => ({ ...h, point: parseEwkbPoint(h.location) }))
        .filter((h): h is HospitalRow & { point: LatLng } => h.point !== null)
        .sort((a, b) => haversineMeters(origin, a.point) - haversineMeters(origin, b.point));

      const nearest = ranked.slice(0, CANDIDATES);
      const included = new Set(nearest.map((hospital) => hospital.id));
      const staffedExtras = ranked
        .filter(
          (hospital) =>
            !included.has(hospital.id) &&
            (staffedIds.has(hospital.id) || hospital.id === assignedHospitalId),
        )
        .slice(0, MAX_STAFFED_EXTRAS);
      const candidates = [...nearest, ...staffedExtras];
      if (candidates.length === 0) throw new Error("no hospitals on file");

      const withRoutes = await Promise.all(
        candidates.map(async (h) => {
          const { routes, live } = await routesTo(origin, h.point);
          return {
            id: h.id,
            name: h.name,
            location: h.point,
            capabilities: h.capabilities ?? [],
            routes,
            live,
            erStaffed: staffedIds.has(h.id),
          };
        }),
      );
      return withRoutes.sort((a, b) => a.routes[0].etaSeconds - b.routes[0].etaSeconds);
    })()
      .then((suggestions) => {
        if (cancelled) return;
        setState({ status: "ready", suggestions });
        const initial =
          suggestions.find((s) => s.id === assignedHospitalId) ?? suggestions[0];
        setPickedId(initial?.id ?? null);
        setSelectedRouteId(initial?.routes[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Couldn't load hospitals. Ask the ambulance crew or LGU dispatch.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // origin is fully described by originKey. assignedHospitalId ensures an
    // already-selected destination stays visible even when it isn't top three.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, assignedHospitalId]);

  const suggestions = state.status === "ready" ? state.suggestions : [];
  const picked = suggestions.find((s) => s.id === pickedId) ?? null;
  const mapHospitals = useMemo(
    () => suggestions.map((s) => ({ id: s.id, name: s.name, location: s.location })),
    [suggestions],
  );

  async function confirmHospital(hospital: Suggestion) {
    if (!incidentId || assigning || assignedHospitalId === hospital.id) return;
    if (
      !window.confirm(
        `Has the ambulance crew confirmed ${hospital.name} as the destination?`,
      )
    ) {
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/hospital`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalId: hospital.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not notify the hospital.");
      await onHospitalAssigned?.();
    } catch (error) {
      setAssignError(
        error instanceof Error ? error.message : "Could not notify the hospital.",
      );
    } finally {
      setAssigning(false);
    }
  }

  if (!origin) {
    return (
      <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        No pickup location yet, so hospitals can&apos;t be ranked. Get the
        caller&apos;s location on the call.
      </p>
    );
  }

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Finding the nearest hospitals by drive time…
      </p>
    );
  }

  if (state.status === "error") {
    return <p className="text-sm text-amber-700">{state.message}</p>;
  }

  return (
    <div className="space-y-3">
      <IncidentMap
        scene={origin}
        hospitals={mapHospitals}
        pickedHospitalId={pickedId}
        routes={picked?.routes ?? []}
        selectedRouteId={selectedRouteId}
        onSelectRoute={setSelectedRouteId}
        viewKey={`${originKey}->${pickedId}`}
      />

      <ol className="space-y-2">
        {suggestions.map((s, i) => {
          const best = s.routes[0];
          const active = s.id === pickedId;
          return (
            <li
              key={s.id}
              className={`rounded-lg border p-3 ${active ? "border-emergency bg-red-50" : "border-slate-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {i === 0 && <Badge tone="blue">Fastest</Badge>}{" "}
                    {s.erStaffed && <Badge tone="green">ER dashboard connected</Badge>}{" "}
                    {s.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {(best.distanceM / 1000).toFixed(1)} km ·{" "}
                    {s.live ? (
                      <Badge tone={trafficTone[best.traffic]}>{best.traffic} traffic</Badge>
                    ) : (
                      <Badge tone="slate">rough estimate</Badge>
                    )}
                    {s.routes.length > 1 && ` · ${s.routes.length} routes`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {s.capabilities.length
                      ? s.capabilities.join(", ")
                      : "Capabilities not on file. Call ahead."}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-slate-900">
                    {s.live ? "" : "~"}
                    {formatEta(best.etaSeconds)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant={active ? "danger" : "outline"}
                  className="px-3 py-1.5 text-xs"
                  onClick={() => {
                    setPickedId(s.id);
                    setSelectedRouteId(best.id);
                    setAssignError(null);
                  }}
                >
                  {active ? "Showing route" : "Show route"}
                </Button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${s.location.lat},${s.location.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-emergency hover:text-emergency focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <Navigation aria-hidden className="h-3.5 w-3.5" />
                  Navigate
                </a>
                {incidentId && active && (
                  <Button
                    variant="primary"
                    className="px-3 py-1.5 text-xs"
                    disabled={assigning || assignedHospitalId === s.id}
                    onClick={() => void confirmHospital(s)}
                  >
                    {assignedHospitalId === s.id
                      ? "ER notified"
                      : assigning
                        ? "Notifying…"
                        : "Ambulance confirmed this hospital"}
                  </Button>
                )}
              </div>
              {assignedHospitalId === s.id && (
                <p className="mt-2 text-xs font-medium text-green-700">
                  This ER can now view and update the shared triage card.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {assignError && (
        <p role="alert" className="text-sm text-red-700">
          {assignError}
        </p>
      )}
      <p className="text-xs text-slate-400">
        The three nearest hospitals are ranked by live drive time. Hospitals
        with a configured ER dashboard also stay selectable. The ambulance
        crew confirms the destination; call ahead so the ER can prepare.
      </p>
    </div>
  );
}
