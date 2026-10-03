// Resolves the signed-in Supabase user and their verified role. Households
// get an anonymous session on SOS, so they resolve here too (role household).
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/auth";
import type { Role } from "@/lib/types";

export interface Caller {
  id: string;
  role: Role;
}

export async function getCaller(): Promise<Caller | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: Role }>();
  if (!data) return null;
  return { id: user.id, role: data.role };
}
