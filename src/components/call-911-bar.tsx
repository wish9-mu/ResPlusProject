// Safety rule #5 from FLOW.md: "Call 911" is always visible.
// Rendered globally in the root layout so it appears on every screen.
export function Call911Bar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-red-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
        <span className="text-xs text-slate-500">
          Res+ works alongside 911 and LGU rescue. It does not replace them.
        </span>
        <a
          href="tel:911"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emergency px-3 py-1.5 text-sm font-semibold text-white hover:bg-emergency-dark"
        >
          ☎ Call 911
        </a>
      </div>
    </div>
  );
}
