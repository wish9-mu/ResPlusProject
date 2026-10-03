// Magic-link callback. Exchanges the auth code for a session, then routes the
// user to their role dashboard. Emails not on the crew allowlist get a
// "household" profile and are told they are not verified crew.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileRole, dashboardPathForRole } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const role = await getProfileRole();
      if (!role || role === "household") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/signin?error=not_crew`);
      }
      // Only honor ?next= when it is a same-site path (no open redirects).
      const dest =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : dashboardPathForRole(role);
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth`);
}
