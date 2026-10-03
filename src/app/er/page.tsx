import { StaffShell } from "@/components/staff-shell";
import { requireRole } from "@/lib/supabase/require-role";
import { ErDashboard } from "./er-dashboard";

export default async function ErPage() {
  const { demo, identity } = await requireRole("er");
  return (
    <StaffShell
      role="ER staff"
      title="Incoming patient"
      subtitle="Accept to prepare, or divert. No response in 2 min auto-escalates to the next capable hospital."
      identity={identity}
      demo={demo}
    >
      <ErDashboard />
    </StaffShell>
  );
}
