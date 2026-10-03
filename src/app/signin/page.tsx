"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Button, Card, Badge } from "@/components/ui";
import { TopBar } from "@/components/top-bar";
import { signInWithPassword, type SignInState } from "./actions";

// Emergency crew sign-in (BHW, Ambulance, ER) with email + password.
// Crew accounts are created by an admin in the Supabase dashboard; the email
// must also be on the crew_allowlist so the account gets a crew role.
const initialState: SignInState = { error: null };

const configured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_");

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      full
      disabled={pending || !configured}
    >
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export default function SignInPage() {
  const [state, formAction] = useFormState(signInWithPassword, initialState);
  const [next, setNext] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  // Read ?next= and ?error= from the URL (set by the role gate).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") ?? "");
    const err = params.get("error");
    if (err === "not_crew") {
      setUrlError(
        "This email is not a verified emergency crew account. Ask your LGU admin to add it to the crew list.",
      );
    } else if (err === "auth") {
      setUrlError("Your session expired. Please sign in again.");
    }
  }, []);

  const error = state.error ?? urlError;

  return (
    <>
      <TopBar signInHref="/signin" />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">
          Emergency crew sign in
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          For BHWs, ambulance crews, and ER staff. Your verified role opens your
          dashboard.
        </p>

        {!configured && (
          <Card className="mt-6 border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2">
              <Badge tone="amber">Demo mode</Badge>
              <span className="text-sm text-amber-800">
                Supabase isn&apos;t configured yet.
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/bhw">
                <Button variant="outline" className="text-xs">
                  BHW dashboard
                </Button>
              </Link>
              <Link href="/ambulance">
                <Button variant="outline" className="text-xs">
                  Ambulance dashboard
                </Button>
              </Link>
              <Link href="/er">
                <Button variant="outline" className="text-xs">
                  ER dashboard
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card className="mt-6">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@lgu.gov.ph"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emergency focus:outline-none focus:ring-1 focus:ring-emergency"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emergency focus:outline-none focus:ring-1 focus:ring-emergency"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <SubmitButton />
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          No account or forgot your password? Ask your LGU admin.
        </p>
        <p className="mt-6 text-center text-sm text-slate-500">
          Not a crew member?{" "}
          <Link href="/" className="font-medium text-emergency hover:underline">
            Go to emergency SOS →
          </Link>
        </p>
      </main>
    </>
  );
}
