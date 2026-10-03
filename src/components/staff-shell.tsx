// Shared chrome for the three staff dashboards (BHW, Ambulance, ER).
// Shows the role, the signed-in identity (or a demo badge), and sign out.
import { Badge } from "@/components/ui";

export function StaffShell({
  role,
  title,
  subtitle,
  identity,
  demo,
  children,
}: {
  role: string;
  title: string;
  subtitle?: string;
  identity?: string | null;
  demo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emergency text-sm font-black text-white">
              +
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">
                Res<span className="text-emergency">+</span>{" "}
                <span className="font-normal text-slate-400">·</span> {role}
              </p>
              <p className="text-xs leading-tight text-slate-500">
                {demo ? "Demo mode (not signed in)" : identity ?? "Signed in"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {demo && <Badge tone="amber">Demo</Badge>}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm font-medium text-slate-500 hover:text-emergency hover:underline"
              >
                {demo ? "Sign in" : "Sign out"}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {children}
      </main>
    </>
  );
}
