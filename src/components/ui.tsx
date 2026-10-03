import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "ghost" | "outline";
  full?: boolean;
};

export function Button({
  variant = "primary",
  full,
  className,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-900",
    danger: "bg-emergency text-white hover:bg-emergency-dark focus:ring-emergency",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-200 focus:ring-slate-400",
    outline:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-400",
  };
  return (
    <button
      className={cn(base, variants[variant], full && "w-full", className)}
      {...props}
    />
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      {title && (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "red" | "green" | "amber" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  role,
  title,
  subtitle,
}: {
  role: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-emergency">
        Res+ · {role}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </header>
  );
}
