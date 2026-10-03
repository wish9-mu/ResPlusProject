// POST /api/routes: traffic-aware routes between two points for the crew map.
// Body: { origin: { lat, lng }, destination: { lat, lng } }
import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileRole, isSupabaseConfigured } from "@/lib/supabase/auth";
import { getRoutes, RoutingUnavailableError } from "@/lib/routing/tomtom";

// Res+ serves the Philippines. Rejecting points outside it keeps this endpoint
// from being used as a general-purpose routing proxy on our TomTom quota.
const phPoint = z.object({
  lat: z.number().min(4).max(22),
  lng: z.number().min(116).max(127),
});
const requestSchema = z.object({ origin: phPoint, destination: phPoint });

export async function POST(request: Request) {
  // Crew only once auth is configured. In demo mode (no Supabase) the
  // dashboards are open for preview, so this endpoint is open too; the TomTom
  // free tier has no card attached, so misuse can only use up the free quota.
  if (isSupabaseConfigured()) {
    const role = await getProfileRole();
    if (!role) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (role === "household") {
      return NextResponse.json({ error: "Crew only." }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "origin and destination must be points in the Philippines." },
      { status: 400 },
    );
  }

  try {
    const result = await getRoutes(parsed.data.origin, parsed.data.destination);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RoutingUnavailableError) {
      // Never log the request URL: it contains the API key.
      console.error("[api/routes]", error.message);
      return NextResponse.json(
        { error: "Live routing is unavailable right now." },
        { status: error.status },
      );
    }
    throw error;
  }
}
