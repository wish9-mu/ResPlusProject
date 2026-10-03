"use server";

// Crew password sign-in. Runs on the server so the session cookie is set
// server-side and the role check happens before any redirect.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  dashboardPathForRole,
} from "@/lib/supabase/auth";
import type { Role } from "@/lib/types";

export interface SignInState {
  error: string | null;
}

const NOT_CREW =
  "This email is not a verified emergency crew account. Ask your LGU admin to add it to the crew list.";

export async function signInWithPassword(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    // Keep the message generic so it doesn't reveal which emails exist.
    if (error?.message === "Email not confirmed") {
      return {
        error:
          "This account isn't confirmed yet. Ask your admin to confirm it in Supabase.",
      };
    }
    return { error: "Wrong email or password." };
  }

  // Same client holds the new session, so RLS sees this user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single<{ role: Role }>();

  const role = profile?.role;
  if (!role || role === "household") {
    await supabase.auth.signOut();
    return { error: NOT_CREW };
  }

  // Only honor ?next= when it is a same-site path (no open redirects).
  // If it points at another role's dashboard, requireRole() reroutes them.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? dashboardPathForRole(role));
}
