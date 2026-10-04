"use client";

// Caller location for the BHW who accepted the SOS: the GPS fix the caller's
// phone sent, on the shared incident map, plus a one-tap "Navigate" link.
// No fix (permission denied, weak GPS): FLOW.md "Bad GPS" fallback, the BHW
// confirms the location on the call.
import { MapPin, Navigation } from "lucide-react";
import { IncidentMap } from "@/components/incident-map";
import type { LatLng } from "@/lib/types";

export function CallerLocationMap({ location }: { location: LatLng | null }) {
  if (!location) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The caller&apos;s phone didn&apos;t share a location. Ask exactly where
          they are and for a landmark.
        </p>
      </div>
    );
  }

  const coords = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  return (
    <div className="space-y-2">
      <IncidentMap scene={location} viewKey={coords} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-mono">{coords}</span>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:border-emergency hover:text-emergency focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <Navigation aria-hidden className="h-4 w-4" />
          Navigate
        </a>
      </div>
      <p className="text-xs text-slate-400">
        Phone GPS can be off by tens of meters. Confirm the house on the call.
      </p>
    </div>
  );
}
