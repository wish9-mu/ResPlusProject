import { StaffShell } from "@/components/staff-shell";
import { requireRole } from "@/lib/supabase/require-role";
import { BhwDashboard } from "./bhw-dashboard";

export default async function BhwPage() {
  const { demo, identity } = await requireRole("bhw");
  return (
    <StaffShell
      role="BHW"
      title="Incoming SOS"
      subtitle="Answer the call, confirm the emergency, then coach on the way."
      identity={identity}
      demo={demo}
    >
      <BhwDashboard />
    </StaffShell>
  );
}
