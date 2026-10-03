"use client";

// Public entry for the incident map. Leaflet touches `window` on import, so
// the real map loads in the browser only, through next/dynamic. Without a
// TomTom key the dashboards still render, with a note in place of the map.
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { IncidentMapProps } from "./incident-map-leaflet";

const hasKey = Boolean(process.env.NEXT_PUBLIC_TOMTOM_KEY);

const LeafletMap = dynamic(
  () => import("./incident-map-leaflet").then((m) => m.IncidentMapLeaflet),
  {
    ssr: false,
    loading: () => <MapPlaceholder>Loading map…</MapPlaceholder>,
  },
);

export function IncidentMap(props: IncidentMapProps) {
  if (!hasKey) {
    return (
      <MapPlaceholder>
        Map is off. Add <code>NEXT_PUBLIC_TOMTOM_KEY</code> to{" "}
        <code>.env.local</code>, then restart the dev server.
      </MapPlaceholder>
    );
  }
  return <LeafletMap {...props} />;
}

function MapPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
      <p>{children}</p>
    </div>
  );
}
