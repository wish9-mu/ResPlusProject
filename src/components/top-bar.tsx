import Image from "next/image";
import Link from "next/link";
import { BriefcaseMedical } from "lucide-react";

// App top bar. On the household landing page it carries the brand and a
// discreet entry point for emergency crews to sign in. Crew auth is wired
// separately; this just routes to the sign-in screen.
export function TopBar({ signInHref = "/signin" }: { signInHref?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {/* Brand wordmark. Source aspect ratio is ~750x210 (≈3.57:1). */}
          <Image
            src="/logo.png"
            alt="Res+ home"
            width={750}
            height={210}
            priority
            className="h-9 w-auto"
          />
        </Link>
        {/* Icon-only crew entry. Kept discreet so families focus on SOS;
            the accessible name and tooltip still say what it does. */}
        <Link
          href={signInHref}
          aria-label="Emergency crew sign in"
          title="Emergency crew sign in"
          className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-emergency hover:text-emergency active:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:px-4"
        >
          <BriefcaseMedical aria-hidden className="h-5 w-5" />
          {/* Text hint on tablet/desktop only; phones stay icon-only. */}
          <span aria-hidden className="hidden text-sm font-medium sm:inline">
            Crew
          </span>
        </Link>
      </div>
    </header>
  );
}

