import { STATUS_LABEL, STATUS_ORDER, type IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// "pills" is the compact wrap layout used on staff dashboards.
// "vertical" is a phone-friendly timeline used on the household screen.
export function StatusStepper({
  status,
  variant = "pills",
}: {
  status: IncidentStatus;
  variant?: "pills" | "vertical";
}) {
  const currentIndex = STATUS_ORDER.indexOf(status);

  if (variant === "vertical") {
    return (
      <ol className="relative space-y-0" aria-label="Emergency progress">
        {STATUS_ORDER.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const last = i === STATUS_ORDER.length - 1;
          return (
            <li
              key={s}
              className="relative flex gap-3 pb-4 last:pb-0"
              aria-current={active ? "step" : undefined}
            >
              {/* Connector line */}
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-0.5",
                    done ? "bg-green-500" : "bg-slate-200",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  active && "bg-emergency text-white ring-4 ring-red-100",
                  done && "bg-green-600 text-white",
                  !active && !done && "bg-slate-200 text-slate-500",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "pt-0.5 text-sm",
                  active && "font-semibold text-slate-900",
                  done && "text-slate-600",
                  !active && !done && "text-slate-400",
                )}
              >
                {STATUS_LABEL[s]}
                {active && <span className="sr-only"> (current)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="flex flex-wrap gap-2">
      {STATUS_ORDER.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li
            key={s}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              active && "bg-emergency text-white",
              done && "bg-green-100 text-green-700",
              !active && !done && "bg-slate-100 text-slate-500",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                active && "bg-white/25",
                done && "bg-green-600 text-white",
                !active && !done && "bg-slate-300 text-white",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            {STATUS_LABEL[s]}
          </li>
        );
      })}
    </ol>
  );
}
