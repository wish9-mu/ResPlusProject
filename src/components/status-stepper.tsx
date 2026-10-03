import { STATUS_LABEL, STATUS_ORDER, type IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusStepper({ status }: { status: IncidentStatus }) {
  const currentIndex = STATUS_ORDER.indexOf(status);
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
