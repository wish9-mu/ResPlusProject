import { StaffShell } from "@/components/staff-shell";
import { requireRole } from "@/lib/supabase/require-role";
import { AmbulanceDashboard } from "./ambulance-dashboard";

export default async function AmbulancePage() {
  const { demo, identity } = await requireRole("ambulance");
  return (
    <StaffShell
      role="Ambulance crew"
      title="Assess & transport"
      subtitle="Pick the hospital and route. Start driving immediately once confirmed."
      identity={identity}
      demo={demo}
    >
      <AmbulanceDashboard />
    </StaffShell>
  );
}
