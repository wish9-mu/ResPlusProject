// Safety rule #5 from FLOW.md: "Call 911" is always visible.
// Rendered globally in the root layout so it appears on every screen.
// Sized as a large thumb target and padded for the phone's home indicator.
export function Call911Bar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-red-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-[11px] leading-tight text-slate-500 sm:text-xs">
          Res+ works alongside 911 and LGU rescue. It does not replace them.
        </span>
        <a
          href="tel:911"
          className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl bg-emergency px-4 text-base font-bold text-white shadow-sm hover:bg-emergency-dark focus:outline-none focus:ring-2 focus:ring-emergency focus:ring-offset-2"
        >
          <PhoneIcon />
          Call 911
        </a>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
