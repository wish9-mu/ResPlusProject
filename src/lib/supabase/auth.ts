// Server-side auth helpers. Centralizes session + role lookups so pages and
// route handlers stay thin. Everything here runs on the server only.
import { createClient } from "./server";
import type { Role } from "@/lib/types";

// Supabase is "configured" only when both the URL and publishable key are set
// to real values. Until then, auth-dependent screens fall back to demo mode so
// the app stays runnable without a project.
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(
    url && !url.includes("YOUR-PROJECT-REF") && key && key.startsWith("sb_"),
  );
}

export async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Returns the signed-in user's role from the profiles table, or null.
export async function getProfileRole(): Promise<Role | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: Role }>();
  if (error || !data) return null;
  return data.role;
}

// Maps a role to its dashboard route.
export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "bhw":
      return "/bhw";
    case "ambulance":
      return "/ambulance";
    case "er":
      return "/er";
    case "household":
    default:
      return "/";
  }
}
