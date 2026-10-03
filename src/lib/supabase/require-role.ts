// Server-side guard for staff dashboards. Returns how a page should render:
//   - "demo": Supabase isn't configured; show the UI without auth.
//   - "authorized": signed in with the matching role.
// Redirects when configured-but-unauthorized (not signed in, or wrong role).
import { redirect } from "next/navigation";
import {
  isSupabaseConfigured,
  getSessionUser,
  getProfileRole,
  dashboardPathForRole,
} from "./auth";
import type { Role } from "@/lib/types";

export interface GateResult {
  demo: boolean;
  identity: string | null;
}

export async function requireRole(role: Role): Promise<GateResult> {
  // No project yet: render in demo mode so the dashboards stay previewable.
  if (!isSupabaseConfigured()) {
    return { demo: true, identity: null };
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/signin?next=${dashboardPathForRole(role)}`);
  }

  const actual = await getProfileRole();
  if (actual !== role) {
    // Not verified crew: explain on the sign-in page.
    if (!actual || actual === "household") {
      redirect("/signin?error=not_crew");
    }
    // Verified crew, wrong dashboard: send them to their own.
    redirect(dashboardPathForRole(actual));
  }

  return { demo: false, identity: user!.email ?? "Signed in" };
}
