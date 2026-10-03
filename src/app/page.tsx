import Link from "next/link";
import { PageHeader } from "@/components/ui";

const roles = [
  {
    href: "/household",
    label: "Household",
    desc: "Tap SOS, talk on the call, follow BHW guidance.",
    emoji: "🏠",
  },
  {
    href: "/bhw",
    label: "BHW",
    desc: "Answer SOS, confirm emergency, coach, give first aid.",
    emoji: "🩺",
  },
  {
    href: "/ambulance",
    label: "Ambulance crew",
    desc: "Assess, pick hospital, pick route.",
    emoji: "🚑",
  },
  {
    href: "/er",
    label: "ER staff",
    desc: "Accept or divert, prepare, update capacity.",
    emoji: "🏥",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        role="Demo"
        title="Res+ Emergency Coordination"
        subtitle="One live record of the emergency, shared across four roles. Pick a role to open its screen."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emergency hover:shadow"
          >
            <div className="text-3xl">{r.emoji}</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-emergency">
              {r.label}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{r.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
