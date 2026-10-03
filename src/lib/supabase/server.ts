// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. Reads/writes cookies so auth sessions persist.
import { createServerClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware refreshes sessions.
          }
        },
      },
    },
  );
}

// Privileged client for server-only tasks that must bypass RLS (writes made
// after an explicit authorization check). NEVER import this into client code.
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }
  return createRawClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
