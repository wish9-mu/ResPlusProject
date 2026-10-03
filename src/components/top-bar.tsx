import Link from "next/link";

// App top bar. On the household landing page it carries the brand and a
// discreet entry point for emergency crews to sign in. Crew auth is wired
// separately; this just routes to the sign-in screen.
export function TopBar({ signInHref = "/signin" }: { signInHref?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Res+ home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emergency text-base font-black text-white">
            +
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Res<span className="text-emergency">+</span>
          </span>
        </Link>
        <Link
          href={signInHref}
          className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-slate-600 hover:text-emergency hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <span className="sm:hidden">Crew sign in</span>
          <span className="hidden sm:inline">Emergency crew sign in →</span>
        </Link>
      </div>
    </header>
  );
}
