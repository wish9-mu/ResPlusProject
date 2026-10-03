// Server-only: traffic-aware routes from the TomTom Routing API.
// Import this from Route Handlers only, never from client components.
//
// ETAs come from TomTom's routing engine with live traffic on (traffic=true),
// so each ETA accounts for current congestion on that route's roads as well
// as its length. One request returns the best route plus up to 2 alternates.
import type { LatLng, RouteOption, TrafficLevel } from "@/lib/types";

const ENDPOINT = "https://api.tomtom.com/routing/1/calculateRoute";
const TIMEOUT_MS = 8_000;
// TECH_STACK.md reliability rule: recompute at most once a minute per leg.
// The cache lives in server memory, so it is per instance (best effort), which
// is enough to absorb repeat requests from the same dashboard.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;

export class RoutingUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: 502 | 503 = 502,
  ) {
    super(message);
  }
}

export interface RoutesResult {
  routes: RouteOption[];
  computedAt: string;
  source: "tomtom";
}

interface TomTomRoute {
  summary: {
    lengthInMeters: number;
    travelTimeInSeconds: number;
    trafficDelayInSeconds?: number;
    noTrafficTravelTimeInSeconds?: number;
  };
  legs: Array<{ points: Array<{ latitude: number; longitude: number }> }>;
}

const cache = new Map<string, { at: number; value: RoutesResult }>();

export async function getRoutes(origin: LatLng, destination: LatLng): Promise<RoutesResult> {
  // ~11 m precision, so tiny GPS jitter reuses the cached result.
  const key = [origin.lat, origin.lng, destination.lat, destination.lng]
    .map((n) => n.toFixed(4))
    .join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = await fetchRoutes(origin, destination);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

async function fetchRoutes(origin: LatLng, destination: LatLng): Promise<RoutesResult> {
  // Optional dedicated server key; otherwise reuse the browser key, which is
  // public anyway because the map tiles need it.
  const apiKey = process.env.TOMTOM_ROUTING_KEY || process.env.NEXT_PUBLIC_TOMTOM_KEY;
  if (!apiKey) throw new RoutingUnavailableError("TomTom key is not configured", 503);

  const params = new URLSearchParams({
    key: apiKey,
    traffic: "true",
    travelMode: "car",
    routeType: "fastest",
    maxAlternatives: "2",
    computeTravelTimeFor: "all",
    routeRepresentation: "polyline",
  });
  const locations = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${locations}/json?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RoutingUnavailableError("TomTom request failed or timed out");
  }
  if (!res.ok) throw new RoutingUnavailableError(`TomTom responded ${res.status}`);

  const data = (await res.json()) as { routes?: TomTomRoute[] };
  const routes = (data.routes ?? []).map(toRouteOption);
  if (routes.length === 0) throw new RoutingUnavailableError("TomTom returned no routes");
  return { routes, computedAt: new Date().toISOString(), source: "tomtom" };
}

function toRouteOption(route: TomTomRoute, index: number): RouteOption {
  const s = route.summary;
  return {
    id: `R${index + 1}`,
    label: `Route ${String.fromCharCode(65 + index)}`, // Route A, B, C
    etaSeconds: s.travelTimeInSeconds,
    distanceM: s.lengthInMeters,
    traffic: trafficLevel(s.travelTimeInSeconds, s.noTrafficTravelTimeInSeconds),
    trafficDelaySeconds: s.trafficDelayInSeconds ?? 0,
    isSelected: index === 0,
    path: route.legs.flatMap((leg) =>
      leg.points.map((p) => ({ lat: round5(p.latitude), lng: round5(p.longitude) })),
    ),
  };
}

// Traffic badge: the live ETA compared with the free-flow ETA of the same
// route, both from the same TomTom response.
function trafficLevel(liveSeconds: number, freeFlowSeconds?: number): TrafficLevel {
  if (!freeFlowSeconds || freeFlowSeconds <= 0) return "unknown";
  const ratio = liveSeconds / freeFlowSeconds;
  if (ratio < 1.15) return "light";
  if (ratio < 1.4) return "moderate";
  return "heavy";
}

// 5 decimals is ~1 m: plenty for drawing, and it keeps the payload small.
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
