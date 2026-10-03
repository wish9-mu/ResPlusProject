import { BhwCallCenter } from "@/components/call/BhwCallCenter";
import { StaffShell } from "@/components/staff-shell";
import { requireRole } from "@/lib/supabase/require-role";
import { BhwDashboard } from "./bhw-dashboard";

export default async function BhwPage() {
  const { demo, identity } = await requireRole("bhw");
  return (
    <StaffShell
      role="BHW"
      title="Incoming SOS"
      subtitle="Accept an SOS to connect the call, then confirm the emergency and coach."
      identity={identity}
      demo={demo}
    >
      {/* Live: the SOS queue, and the incident workspace once one is accepted.
          Demo mode (no Supabase): the original mock patient flow. */}
      {demo ? <BhwDashboard /> : <BhwCallCenter />}
    </StaffShell>
  );
}
