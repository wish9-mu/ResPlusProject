// Fallback route when live routing is unavailable (FLOW.md rule 4: never a
// dead end). These are rough planning numbers, not measurements: straight-line
// distance times a typical urban detour factor, driven at an assumed Metro
// Manila speed. The UI labels the result "est." so the crew knows it's rough.
import type { LatLng, RouteOption } from "@/lib/types";

const ROAD_DETOUR_FACTOR = 1.4;
const ASSUMED_SPEED_KMH = 25;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateRoute(origin: LatLng, destination: LatLng): RouteOption {
  const distanceM = Math.round(haversineMeters(origin, destination) * ROAD_DETOUR_FACTOR);
  const metersPerSecond = (ASSUMED_SPEED_KMH * 1000) / 3600;
  return {
    id: "EST",
    label: "Straight-line estimate",
    etaSeconds: Math.round(distanceM / metersPerSecond),
    distanceM,
    traffic: "unknown",
    trafficDelaySeconds: 0,
    isSelected: true,
    path: [origin, destination],
    estimated: true,
  };
}
