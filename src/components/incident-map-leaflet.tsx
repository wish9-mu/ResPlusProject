"use client";

// Incident map for the staff dashboards. Browser-only: Leaflet needs
// `window`, so this file is loaded through next/dynamic in incident-map.tsx.
//
// Base map: TomTom Map Display raster tiles.
// Traffic heat map: TomTom Traffic Flow raster tiles ("relative0" style),
// which color each road by its current speed compared with its free-flow speed.
// Routes: drawn from the road geometry /api/routes returns. The selected
// route is highlighted; switching happens from the route list or the chips in
// full view (not by tapping lines, since routes share road at both ends).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { placeArrows } from "@/lib/map/route-arrows";
import type { LatLng, RouteOption } from "@/lib/types";
import { cn, formatEta } from "@/lib/utils";

const KEY = encodeURIComponent(process.env.NEXT_PUBLIC_TOMTOM_KEY ?? "");

const BASE_TILES = `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?view=Unified&key=${KEY}`;
const TRAFFIC_TILES = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${KEY}`;
const ATTRIBUTION =
  '&copy; <a href="https://www.tomtom.com" target="_blank" rel="noopener noreferrer">TomTom</a>';

// TomTom serves flow tiles with Cache-Control: no-store, so a new URL pulls
// current conditions. Refresh every 2 minutes, only while the tab is visible,
// to keep tile usage inside the free tier.
const TRAFFIC_REFRESH_MS = 2 * 60 * 1000;

// Fallback view when there is nothing to frame: Quezon City.
const QC_CENTER: [number, number] = [14.676, 121.043];
const FRAME_PADDING: [number, number] = [32, 32];

const SELECTED_ROUTE_COLOR = "#1d4ed8"; // blue-700
const ALTERNATE_ROUTE_COLOR = "#64748b"; // slate-500

export interface MapHospital {
  id: string;
  name: string;
  location: LatLng;
}

export interface IncidentMapProps {
  scene: LatLng | null;
  ambulance?: LatLng | null;
  bhw?: LatLng | null;
  hospitals?: MapHospital[];
  pickedHospitalId?: string | null;
  routes?: RouteOption[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  // Change this when the leg changes (new origin or destination) so the map
  // reframes around the new trip.
  viewKey?: string;
  // Ambulance screen: offer a full-screen map.
  allowFullView?: boolean;
  fullViewTitle?: string;
}

interface PointStyle {
  letter: string; // keeps markers readable without relying on color or emoji
  emoji: string; // floats above the circle (decorative; the title names it)
  badge: string; // Tailwind classes for the circle
  pulse?: string; // Tailwind bg class for the pulse ring; omit for no pulse
  size: number;
}

const EMOJI_SIZE = 18;

// Letter circle + optional pulse ring + emoji above. Built as a divIcon
// instead of Leaflet's default image pins, which break under bundlers.
// Animations live in globals.css (rp-*) and stop under reduced motion.
function pointIcon({ letter, emoji, badge, pulse, size }: PointStyle) {
  const half = size / 2;
  return L.divIcon({
    className: "",
    html:
      `<div class="rp-marker rp-pop" style="width:${size}px;height:${size}px">` +
      (pulse ? `<span class="rp-pulse ${pulse}"></span>` : "") +
      `<span class="relative flex h-full w-full items-center justify-center rounded-full border-2 font-bold shadow-md ${badge}" style="font-size:${Math.round(size * 0.45)}px">${letter}</span>` +
      `<span class="rp-emoji" style="font-size:${EMOJI_SIZE}px" aria-hidden="true">${emoji}</span>` +
      `</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    // Above the emoji, so tooltips don't cover it.
    tooltipAnchor: [0, -(half + EMOJI_SIZE + 4)],
  });
}

// White chevron for the selected route, rotated to the road's direction on
// screen. The inner element runs the flow animation (see .rp-arrow).
function arrowIcon(angleDeg: number, delaySeconds: number) {
  return L.divIcon({
    className: "",
    html:
      `<div style="width:12px;height:12px;transform:rotate(${angleDeg.toFixed(1)}deg)">` +
      `<div class="rp-arrow" style="animation-delay:${delaySeconds.toFixed(2)}s">` +
      `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4 2.5 8 6 4 9.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
      `</div></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// Small pill centered on a route, e.g. "A · 10 min".
function routeLabelIcon(text: string, selected: boolean) {
  const tone = selected
    ? "border-blue-800 bg-blue-700 text-white"
    : "border-slate-300 bg-white text-slate-700";
  return L.divIcon({
    className: "",
    html: `<span class="whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow ${tone}" style="position:absolute;transform:translate(-50%,-50%)">${text}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

const PICKED_BADGE = "border-white bg-blue-700 text-white";

const EMOJI = {
  patient: "🆘",
  ambulance: "🚑",
  bhw: "🧑‍⚕️",
  hospital: "🏥",
} as const;

// Only the people and the chosen destination pulse; other hospitals stay
// still so the map doesn't get noisy.
const sceneIcon = pointIcon({
  letter: "P",
  emoji: EMOJI.patient,
  badge: "border-white bg-emergency text-white",
  pulse: "bg-red-500",
  size: 28,
});
const ambulanceIcon = pointIcon({
  letter: "A",
  emoji: EMOJI.ambulance,
  badge: "border-white bg-slate-900 text-white",
  pulse: "bg-slate-500",
  size: 28,
});
const bhwIcon = pointIcon({
  letter: "B",
  emoji: EMOJI.bhw,
  badge: "border-white bg-emerald-600 text-white",
  pulse: "bg-emerald-500",
  size: 26,
});
const hospitalIcon = pointIcon({
  letter: "H",
  emoji: EMOJI.hospital,
  badge: "border-blue-700 bg-white text-blue-700",
  size: 24,
});
const pickedHospitalIcon = pointIcon({
  letter: "H",
  emoji: EMOJI.hospital,
  badge: PICKED_BADGE,
  pulse: "bg-blue-500",
  size: 28,
});

const TRAFFIC_DOT = {
  light: "bg-green-500",
  moderate: "bg-amber-500",
  heavy: "bg-red-600",
  unknown: "bg-slate-400",
} as const;

const toPositions = (path: LatLng[]) => path.map((p) => [p.lat, p.lng] as [number, number]);

function midpoint(path: LatLng[]): LatLng | null {
  if (path.length === 0) return null;
  if (path.length === 2) {
    return { lat: (path[0].lat + path[1].lat) / 2, lng: (path[0].lng + path[1].lng) / 2 };
  }
  return path[Math.floor(path.length / 2)];
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "Route A" -> "A"; the estimate keeps a clear word instead.
const shortLabel = (route: RouteOption) =>
  route.estimated ? "Estimate" : route.label.replace(/^Route\s+/, "");

const etaText = (route: RouteOption) =>
  `${route.estimated ? "~" : ""}${formatEta(route.etaSeconds)}`;

export function IncidentMapLeaflet({
  scene,
  ambulance = null,
  bhw = null,
  hospitals = [],
  pickedHospitalId = null,
  routes = [],
  selectedRouteId = null,
  onSelectRoute,
  viewKey = "",
  allowFullView = false,
  fullViewTitle = "Map",
}: IncidentMapProps) {
  const [showTraffic, setShowTraffic] = useState(true);
  const [trafficStamp, setTrafficStamp] = useState(() => Date.now());
  const [baseFailed, setBaseFailed] = useState(false);
  const [trafficFailed, setTrafficFailed] = useState(false);
  const [fullView, setFullView] = useState(false);
  const baseLoaded = useRef(false);
  const trafficLoaded = useRef(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const exitButton = useRef<HTMLButtonElement>(null);
  const wasFullView = useRef(false);

  useEffect(() => {
    if (!showTraffic) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTrafficStamp(Date.now());
    }, TRAFFIC_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [showTraffic]);

  // Full view: Esc closes it, the page behind doesn't scroll, and focus moves
  // to "Exit full view" and back to "Full view" afterwards. It is deliberately
  // not a modal focus trap: the Call 911 bar must stay reachable.
  useEffect(() => {
    if (fullView) {
      wasFullView.current = true;
      exitButton.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setFullView(false);
      };
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = previousOverflow;
      };
    }
    if (wasFullView.current) {
      wasFullView.current = false;
      openButton.current?.focus();
    }
  }, [fullView]);

  // Only flag a failure if no tile has loaded yet, so one dropped tile on a
  // weak connection doesn't cover a working map.
  const baseEvents = useMemo(
    () => ({
      tileload: () => {
        baseLoaded.current = true;
        setBaseFailed(false);
      },
      tileerror: () => {
        if (!baseLoaded.current) setBaseFailed(true);
      },
    }),
    [],
  );
  const trafficEvents = useMemo(
    () => ({
      tileload: () => {
        trafficLoaded.current = true;
        setTrafficFailed(false);
      },
      tileerror: () => {
        if (!trafficLoaded.current) setTrafficFailed(true);
      },
    }),
    [],
  );

  const selected = routes.find((r) => r.id === selectedRouteId) ?? null;
  const alternates = routes.filter((r) => r.id !== selected?.id);

  // Everything worth keeping in view: the markers plus every route's geometry.
  const framePoints = useMemo(() => {
    const points: [number, number][] = [];
    for (const p of [scene, ambulance, bhw, ...hospitals.map((h) => h.location)]) {
      if (p) points.push([p.lat, p.lng]);
    }
    for (const r of routes) points.push(...toPositions(r.path));
    return points;
  }, [scene, ambulance, bhw, hospitals, routes]);

  // Reframe when the trip changes, when routes arrive, or when full view
  // toggles. A plain refresh of the same routes keeps the crew's current view.
  const frameKey = `${viewKey}|${routes.map((r) => r.id).join(",")}|${fullView}`;

  const initialView =
    framePoints.length >= 2
      ? { bounds: L.latLngBounds(framePoints), boundsOptions: { padding: FRAME_PADDING } }
      : { center: framePoints[0] ?? QC_CENTER, zoom: framePoints[0] ? 15 : 12 };

  return (
    <div>
      {/* In full view this box covers the screen above the Call 911 bar,
          which stays visible below it (FLOW.md safety rule 5). */}
      <div
        className={
          fullView
            ? "fixed inset-x-0 top-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col bg-white"
            : undefined
        }
      >
        {fullView && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1.5">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {fullViewTitle}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <TrafficToggle checked={showTraffic} onChange={setShowTraffic} />
              <button
                ref={exitButton}
                type="button"
                onClick={() => setFullView(false)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Exit full view
              </button>
            </div>
          </div>
        )}

        {/* `isolate` keeps Leaflet's high z-indexes inside this box so the map
            never covers the always-visible Call 911 bar. */}
        <div
          role="region"
          aria-label="Incident map"
          className={cn(
            "relative isolate overflow-hidden",
            fullView ? "min-h-0 flex-1" : "h-72 rounded-lg border border-slate-200",
          )}
        >
          <MapContainer {...initialView} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer
              url={BASE_TILES}
              attribution={ATTRIBUTION}
              maxZoom={18}
              eventHandlers={baseEvents}
            />
            {showTraffic && (
              <TileLayer
                url={`${TRAFFIC_TILES}&t=${trafficStamp}`}
                zIndex={2}
                maxZoom={18}
                eventHandlers={trafficEvents}
              />
            )}

            {/* Alternates first, so the selected route draws on top. Keys
                include the role so a switch redraws the lines in order. */}
            {alternates.map((r) => (
              <RouteLine key={`${r.id}-alt`} route={r} selected={false} />
            ))}
            {selected && <RouteLine key={`${selected.id}-sel`} route={selected} selected />}
            {selected && !selected.estimated && (
              <RouteArrows key={`${selected.id}-arrows`} path={selected.path} />
            )}
            {routes.map((r) => (
              <RouteLabel key={`${r.id}-label`} route={r} selected={r.id === selected?.id} />
            ))}

            {bhw && (
              <Marker
                position={[bhw.lat, bhw.lng]}
                icon={bhwIcon}
                title="BHW (health worker)"
                zIndexOffset={850}
              >
                <Tooltip>BHW (health worker)</Tooltip>
              </Marker>
            )}
            {ambulance && (
              <Marker
                position={[ambulance.lat, ambulance.lng]}
                icon={ambulanceIcon}
                title="Ambulance"
                zIndexOffset={900}
              >
                <Tooltip>Ambulance</Tooltip>
              </Marker>
            )}
            {scene && (
              <Marker
                position={[scene.lat, scene.lng]}
                icon={sceneIcon}
                title="Patient location (scene)"
                zIndexOffset={1000}
              >
                <Tooltip>Patient (scene)</Tooltip>
              </Marker>
            )}
            {hospitals.map((h) => {
              const picked = h.id === pickedHospitalId;
              const label = picked ? `${h.name} (picked)` : h.name;
              return (
                <Marker
                  key={h.id}
                  position={[h.location.lat, h.location.lng]}
                  icon={picked ? pickedHospitalIcon : hospitalIcon}
                  title={label}
                  zIndexOffset={picked ? 800 : 600}
                >
                  <Tooltip>{label}</Tooltip>
                </Marker>
              );
            })}

            <MapViewport frameKey={frameKey} points={framePoints} fullView={fullView} />
          </MapContainer>

          {allowFullView && !fullView && (
            <button
              ref={openButton}
              type="button"
              onClick={() => setFullView(true)}
              className="absolute right-2 top-2 z-[1000] inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <ExpandIcon />
              Full view
            </button>
          )}

          {baseFailed && (
            <p
              role="alert"
              className="absolute inset-x-2 top-14 z-[1000] rounded-md bg-white/95 p-2 text-center text-xs text-red-700 shadow"
            >
              Map tiles didn&apos;t load. Check NEXT_PUBLIC_TOMTOM_KEY and your
              connection. The rest of this screen still works.
            </p>
          )}
        </div>

        {fullView && routes.length > 0 && (
          <div
            role="group"
            aria-label="Choose a route"
            className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2"
          >
            {routes.map((r) => {
              const isSelected = r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!onSelectRoute}
                  onClick={() => onSelectRoute?.(r.id)}
                  className={cn(
                    "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                    isSelected
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 rounded-full ring-2 ring-white/70", TRAFFIC_DOT[r.traffic])}
                  />
                  {r.label} · {etaText(r)}
                  <span className="sr-only">
                    {r.estimated ? ", rough estimate" : `, ${r.traffic} traffic`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!fullView && (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Map legend">
              {scene && <LegendItem badge={<LegendEmoji>{EMOJI.patient}</LegendEmoji>}>Patient</LegendItem>}
              {ambulance && (
                <LegendItem badge={<LegendEmoji>{EMOJI.ambulance}</LegendEmoji>}>Ambulance</LegendItem>
              )}
              {bhw && <LegendItem badge={<LegendEmoji>{EMOJI.bhw}</LegendEmoji>}>BHW</LegendItem>}
              {hospitals.length > 0 && (
                <>
                  <LegendItem badge={<LegendEmoji>{EMOJI.hospital}</LegendEmoji>}>Hospital</LegendItem>
                  <LegendItem badge={<LegendBadge classes={PICKED_BADGE}>H</LegendBadge>}>
                    Picked hospital
                  </LegendItem>
                </>
              )}
              {selected && (
                <LegendItem badge={<LineSwatch color={SELECTED_ROUTE_COLOR} />}>
                  Selected route
                </LegendItem>
              )}
              {alternates.length > 0 && (
                <LegendItem badge={<LineSwatch color={ALTERNATE_ROUTE_COLOR} />}>
                  Alternate
                </LegendItem>
              )}
            </ul>
            <TrafficToggle checked={showTraffic} onChange={setShowTraffic} />
          </div>

          {showTraffic &&
            (trafficFailed ? (
              <p className="text-xs text-amber-700">
                Live traffic is unavailable right now. The map and routes still work.
              </p>
            ) : (
              <ul
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"
                aria-label="Traffic colors"
              >
                <TrafficSwatch className="bg-green-500">Free flow</TrafficSwatch>
                <TrafficSwatch className="bg-orange-500">Light traffic</TrafficSwatch>
                <TrafficSwatch className="bg-red-600">Heavy traffic</TrafficSwatch>
                <li>Updates every 2 min</li>
              </ul>
            ))}
        </>
      )}
    </div>
  );
}

function RouteLine({ route, selected }: { route: RouteOption; selected: boolean }) {
  const positions = useMemo(() => toPositions(route.path), [route.path]);
  const dashArray = route.estimated ? "8 10" : undefined;

  if (!selected) {
    return (
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{ color: ALTERNATE_ROUTE_COLOR, weight: 5, opacity: 0.75, dashArray }}
      />
    );
  }
  return (
    <>
      {/* White casing keeps the highlight readable over the traffic colors. */}
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.9 }}
      />
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{ color: SELECTED_ROUTE_COLOR, weight: 7, opacity: 0.95, dashArray }}
      />
    </>
  );
}

// Direction arrows on the selected route, in the order the ambulance drives
// it (routes run origin -> destination). They are spaced by screen distance,
// so they stay readable at any zoom, and re-placed after every zoom.
const ARROW_SPACING_PX = 70;
const MAX_ARROWS = 40;
const ARROW_CYCLE_S = 1.8; // matches the rp-arrow-flow animation length
const ARROWS_PER_WAVE = 6; // same wave speed on short and long routes

interface Arrow {
  position: [number, number];
  angle: number;
  delay: number;
}

function RouteArrows({ path }: { path: LatLng[] }) {
  const map = useMap();
  const [arrows, setArrows] = useState<Arrow[]>([]);

  useEffect(() => {
    const projection = {
      toScreen: (p: LatLng) => map.latLngToLayerPoint([p.lat, p.lng]),
      toLatLng: (x: number, y: number) => map.layerPointToLatLng(L.point(x, y)),
    };
    const place = () =>
      setArrows(
        placeArrows(path, projection, ARROW_SPACING_PX, MAX_ARROWS).map((a, k) => ({
          position: [a.position.lat, a.position.lng],
          angle: a.angleDeg,
          // Staggered start times make a wave run from origin to destination.
          delay: ((k % ARROWS_PER_WAVE) * ARROW_CYCLE_S) / ARROWS_PER_WAVE,
        })),
      );
    place();
    map.on("zoomend", place);
    return () => {
      map.off("zoomend", place);
    };
  }, [map, path]);

  return (
    <>
      {arrows.map((arrow, i) => (
        <ArrowMarker key={i} arrow={arrow} />
      ))}
    </>
  );
}

function ArrowMarker({ arrow }: { arrow: Arrow }) {
  const icon = useMemo(() => arrowIcon(arrow.angle, arrow.delay), [arrow.angle, arrow.delay]);
  return (
    <Marker
      position={arrow.position}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={-100}
    />
  );
}

function RouteLabel({ route, selected }: { route: RouteOption; selected: boolean }) {
  const text = `${selected ? `${EMOJI.ambulance} ` : ""}${shortLabel(route)} · ${etaText(route)}`;
  const icon = useMemo(() => routeLabelIcon(text, selected), [text, selected]);
  const position = useMemo(() => {
    const mid = midpoint(route.path);
    return mid ? ([mid.lat, mid.lng] as [number, number]) : null;
  }, [route.path]);

  if (!position) return null;
  return (
    <Marker
      position={position}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={selected ? 400 : 200}
    />
  );
}

// Keeps the camera useful: reframes on `frameKey` changes. Leaflet also has
// to re-measure its container after full view changes its size.
function MapViewport({
  frameKey,
  points,
  fullView,
}: {
  frameKey: string;
  points: [number, number][];
  fullView: boolean;
}) {
  const map = useMap();
  const latestPoints = useRef(points);
  latestPoints.current = points;
  const lastFullView = useRef(fullView);

  useEffect(() => {
    const resized = lastFullView.current !== fullView;
    lastFullView.current = fullView;
    const id = window.requestAnimationFrame(() => {
      map.invalidateSize();
      const pts = latestPoints.current;
      if (pts.length === 0) return;
      if (pts.length === 1) {
        map.setView(pts[0], 15);
        return;
      }
      const bounds = L.latLngBounds(pts);
      // Glide to a new trip. Jump instead right after a resize (full view),
      // or when the user prefers reduced motion.
      if (resized || prefersReducedMotion()) {
        map.fitBounds(bounds, { padding: FRAME_PADDING, animate: false });
      } else {
        map.flyToBounds(bounds, { padding: FRAME_PADDING, duration: 0.8 });
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [map, frameKey, fullView]);

  // Wheel zoom only in full view, so the inline map doesn't trap page scroll.
  useEffect(() => {
    if (fullView) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [map, fullView]);

  return null;
}

function TrafficToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emergency"
      />
      Live traffic
    </label>
  );
}

function LegendBadge({ classes, children }: { classes: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${classes}`}
    >
      {children}
    </span>
  );
}

function LegendEmoji({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="text-sm leading-none">
      {children}
    </span>
  );
}

function LineSwatch({ color }: { color: string }) {
  return (
    <span aria-hidden className="h-1.5 w-4 rounded-full" style={{ backgroundColor: color }} />
  );
}

function LegendItem({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      {badge}
      {children}
    </li>
  );
}

function TrafficSwatch({ className, children }: { className: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-1.5 w-4 rounded-full ${className}`} />
      {children}
    </li>
  );
}

function ExpandIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
