// Pure geometry for the direction arrows drawn on the selected route.
// Kept free of Leaflet so it can be tested without a browser.
import type { LatLng } from "@/lib/types";

export interface ScreenProjection {
  toScreen(point: LatLng): { x: number; y: number };
  toLatLng(x: number, y: number): LatLng;
}

export interface ArrowPlacement {
  position: LatLng;
  // Screen angle in degrees: 0 points right, 90 points down (CSS rotate()).
  angleDeg: number;
}

// Walks the path in screen pixels, drops an arrow every ~spacingPx, and
// points each one along the segment under it. Paths run origin -> destination,
// so the arrows point the way the ambulance drives.
export function placeArrows(
  path: LatLng[],
  projection: ScreenProjection,
  spacingPx: number,
  maxArrows: number,
): ArrowPlacement[] {
  if (path.length < 2) return [];
  const pts = path.map((p) => projection.toScreen(p));
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  if (total < spacingPx) return [];

  const count = Math.min(maxArrows, Math.floor(total / spacingPx));
  const arrows: ArrowPlacement[] = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const target = ((k + 0.5) * total) / count;
    // Advance to the segment containing `target`, skipping zero-length ones
    // (repeated points) so every arrow gets a real direction.
    while (
      seg < pts.length - 1 &&
      (cumulative[seg] < target || cumulative[seg] - cumulative[seg - 1] < 0.5)
    ) {
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const segLength = cumulative[seg] - cumulative[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - cumulative[seg - 1]) / segLength));
    arrows.push({
      position: projection.toLatLng(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
      angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
  }
  return arrows;
}
