"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import type { IncidentStatus } from "@/lib/types";

interface Action {
  next: IncidentStatus;
  title: string;
  description: string;
  label: string;
}

const BHW_ACTIONS: Partial<Record<IncidentStatus, Action>> = {
  sos: {
    next: "confirmed",
    title: "Confirm emergency",
    description:
      "A person must verify the emergency. Dispatch never waits for transcription or AI.",
    label: "Confirm emergency → dispatch ambulance",
  },
  confirmed: {
    next: "bhw_on_scene",
    title: "BHW response",
    description: "Mark this when you reach the patient.",
    label: "I'm with the patient",
  },
  bhw_on_scene: {
    next: "ambulance_on_scene",
    title: "Ambulance response",
    description: "Mark this when the ambulance reaches the scene.",
    label: "Ambulance arrived",
  },
  ambulance_on_scene: {
    next: "transporting",
    title: "Patient pickup",
    description:
      "Mark this only after the patient is inside the ambulance and ready to leave.",
    label: "Patient picked up",
  },
};

const ER_ACTIONS: Partial<Record<IncidentStatus, Action>> = {
  transporting: {
    next: "arrived",
    title: "Arrival",
    description: "Mark this when the ambulance and patient reach the ER.",
    label: "Patient arrived at ER",
  },
  arrived: {
    next: "closed",
    title: "Handoff complete",
    description: "Close the incident after the receiving team completes handoff.",
    label: "Complete handoff & close",
  },
};

export function IncidentStatusActions({
  incidentId,
  status,
  role,
  onUpdated,
}: {
  incidentId: string;
  status: IncidentStatus;
  role: "bhw" | "er";
  onUpdated: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = (role === "bhw" ? BHW_ACTIONS : ER_ACTIONS)[status];

  if (!action) return null;

  async function transition() {
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not update the status.");
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title={action.title}>
      <p className="mb-3 text-sm text-slate-600">{action.description}</p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button variant="danger" full disabled={pending} onClick={() => void transition()}>
        {pending ? "Updating…" : action.label}
      </Button>
    </Card>
  );
}
