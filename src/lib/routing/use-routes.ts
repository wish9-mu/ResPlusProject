"use client";

// Fetches live routes for one leg (origin -> destination) from /api/routes.
// If live routing fails, falls back to a straight-line estimate so the crew
// always has something to drive toward (FLOW.md rule 4: never a dead end).
import { useCallback, useEffect, useState } from "react";
import type { LatLng, RouteOption } from "@/lib/types";
import { estimateRoute } from "./estimate";

export type RoutesStatus = "idle" | "loading" | "live" | "estimate";

interface RoutesState {
  legKey: string | null;
  status: RoutesStatus;
  routes: RouteOption[];
  computedAt: string | null;
}

const IDLE: RoutesState = { legKey: null, status: "idle", routes: [], computedAt: null };


export function useRoutes(origin: LatLng | null, destination: LatLng | null) {
  const [state, setState] = useState<RoutesState>(IDLE);
  const [refreshCount, setRefreshCount] = useState(0);

  // A primitive key, so a new object with the same coordinates doesn't refetch.
  const legKey =
    origin && destination
      ? `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`
      : null;

  useEffect(() => {
    if (!origin || !destination || !legKey) {
      setState(IDLE);
      return;
    }

    const controller = new AbortController();
    // Same leg (a refresh): keep showing the current routes while loading.
    // New leg: clear them so stale lines don't point to the old destination.
    setState((prev) =>
      prev.legKey === legKey
        ? { ...prev, status: "loading" }
        : { legKey, status: "loading", routes: [], computedAt: null },
    );

    fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`routes request failed: ${res.status}`);
        return (await res.json()) as { routes: RouteOption[]; computedAt: string };
      })
      .then((data) =>
        setState({ legKey, status: "live", routes: data.routes, computedAt: data.computedAt }),
      )
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({
          legKey,
          status: "estimate",
          routes: [estimateRoute(origin, destination)],
          computedAt: new Date().toISOString(),
        });
      });

    return () => controller.abort();
    // origin and destination are fully described by legKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  // Until the effect above catches up with a new leg, report it as loading
  // rather than briefly showing the previous leg's routes.
  const isCurrent = state.legKey === legKey;
  const status: RoutesStatus = isCurrent ? state.status : legKey ? "loading" : "idle";
  return {
    legKey,
    status,
    routes: isCurrent ? state.routes : NO_ROUTES,
    computedAt: isCurrent ? state.computedAt : null,
    refresh,
  };
}

// Stable empty list, so effects keyed on `routes` don't re-run every render.
const NO_ROUTES: RouteOption[] = [];
