// Resolves the signed-in Supabase user and their verified role. Households
// get an anonymous session on SOS, so they resolve here too (role household).
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/auth";
import type { Role } from "@/lib/types";

export interface Caller {
  id: string;
  role: Role;
  // ER staff are authorized at hospital level, not across all hospitals.
  hospitalId?: string | null;
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
    .select("role,hospital_id")
    .eq("id", user.id)
    .single<{ role: Role; hospital_id: string | null }>();
  if (!data) return null;
  return { id: user.id, role: data.role, hospitalId: data.hospital_id };
}
