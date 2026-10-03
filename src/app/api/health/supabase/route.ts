// GET /api/health/supabase - verifies the Supabase connection and env wiring.
// Visit this after filling .env.local and running the migrations/seed.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || url.includes("YOUR-PROJECT-REF") || !key) {
    return NextResponse.json(
      {
        ok: false,
        reason: "env not configured",
        hint: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("hospitals")
      .select("*", { count: "exact", head: true });
    if (error) {
      return NextResponse.json(
        { ok: false, reason: "query failed", detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, hospitals: count ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "connection failed", detail: String(e) },
      { status: 500 },
    );
  }
}
