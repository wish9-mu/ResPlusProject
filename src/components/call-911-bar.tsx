import { Phone } from "lucide-react";

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
          <Phone aria-hidden className="h-5 w-5" />
          Call 911
        </a>
      </div>
    </div>
  );
}
