"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  deriveMissingFields,
  type IncidentTriage,
} from "@/lib/incidents/triage";
import type { IncidentSnapshot } from "@/lib/incidents/use-incident-realtime";

interface Props {
  incidentId: string;
  snapshot: IncidentSnapshot;
  // Patient/enrollment data can prefill an empty live card; it remains factual
  // and is only persisted when a staff member taps Save.
  prefill?: Partial<IncidentTriage>;
  onSaved: () => void | Promise<void>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function withPrefill(
  value: IncidentTriage,
  prefill: Partial<IncidentTriage> | undefined,
): IncidentTriage {
  if (!prefill) return { ...value };
  const result = { ...value };
  for (const key of Object.keys(prefill) as Array<keyof IncidentTriage>) {
    const current = result[key];
    const fallback = prefill[key];
    if ((current === "" || current === null) && fallback !== undefined) {
      // All values come from the typed IncidentTriage contract.
      (result as Record<string, unknown>)[key] = fallback;
    }
  }
  return result;
}

function sameTriage(a: IncidentTriage, b: IncidentTriage): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function IncidentTriageEditor({
  incidentId,
  snapshot,
  prefill,
  onSaved,
}: Props) {
  const initialDraft = withPrefill(snapshot.triage, prefill);
  const [draft, setDraft] = useState<IncidentTriage>(() => initialDraft);
  const [unstable, setUnstable] = useState(snapshot.unstable);
  const [dirty, setDirty] = useState(
    () => !sameTriage(initialDraft, snapshot.triage),
  );
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(snapshot.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const remoteChanged = dirty && snapshot.updatedAt !== baseUpdatedAt;
  const missing = useMemo(() => deriveMissingFields(draft), [draft]);

  useEffect(() => {
    if (dirty) return;
    const next = withPrefill(snapshot.triage, prefill);
    setDraft(next);
    setUnstable(snapshot.unstable);
    setBaseUpdatedAt(snapshot.updatedAt);
  }, [snapshot, prefill, dirty]);

  function setField<K extends keyof IncidentTriage>(
    key: K,
    value: IncidentTriage[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaveState("idle");
    setMessage(null);
  }

  function reloadRemote() {
    setDraft(withPrefill(snapshot.triage, prefill));
    setUnstable(snapshot.unstable);
    setDirty(false);
    setBaseUpdatedAt(snapshot.updatedAt);
    setSaveState("idle");
    setMessage(null);
  }

  async function save() {
    setSaveState("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triage: draft, unstable }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save the card.");
      setDirty(false);
      setSaveState("saved");
      setBaseUpdatedAt(new Date().toISOString());
      await onSaved();
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Could not save the card.");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Record observed facts only. This card does not provide medical advice;
        the BHW or ER staff remains the decision-maker.
      </div>

      {remoteChanged && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            Another staff member updated this incident. Your unsaved fields were
            kept; reload before saving if you want their latest card.
          </span>
          <Button type="button" variant="outline" onClick={reloadRemote}>
            Reload latest
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Patient name" required>
          <input
            value={draft.patientName}
            onChange={(e) => setField("patientName", e.target.value)}
            className={inputClass}
            placeholder="Full name or Unknown"
          />
        </Field>
        <Field label="Age" required>
          <input
            type="number"
            min={0}
            max={130}
            value={draft.age ?? ""}
            onChange={(e) =>
              setField("age", e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputClass}
            placeholder="Age"
          />
        </Field>
      </div>

      <Field label="What happened / chief complaint" required>
        <textarea
          rows={2}
          value={draft.chiefComplaint}
          onChange={(e) => setField("chiefComplaint", e.target.value)}
          className={inputClass}
          placeholder="What the caller, BHW, or ER observed"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Suspected condition">
          <input
            value={draft.suspectedCondition}
            onChange={(e) => setField("suspectedCondition", e.target.value)}
            className={inputClass}
            placeholder="e.g. suspected stroke"
          />
        </Field>
        <Field label="Onset time" required>
          <input
            value={draft.onsetTime}
            onChange={(e) => setField("onsetTime", e.target.value)}
            className={inputClass}
            placeholder="e.g. 7:10 AM or 10 minutes ago"
          />
        </Field>
        <Field label="Blood pressure">
          <input
            value={draft.bloodPressure}
            onChange={(e) => setField("bloodPressure", e.target.value)}
            className={inputClass}
            placeholder="e.g. 160/95"
          />
        </Field>
        <Field label="Blood sugar">
          <input
            value={draft.bloodSugar}
            onChange={(e) => setField("bloodSugar", e.target.value)}
            className={inputClass}
            placeholder="Value and unit"
          />
        </Field>
      </div>

      <Field label="Exact location / landmark" required>
        <input
          value={draft.exactLocation}
          onChange={(e) => setField("exactLocation", e.target.value)}
          className={inputClass}
          placeholder="Address, gate color, nearby landmark"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Conditions and medicines" required>
          <textarea
            rows={2}
            value={draft.conditionsAndMeds}
            onChange={(e) => setField("conditionsAndMeds", e.target.value)}
            className={inputClass}
            placeholder="Known conditions and current medicines; Unknown if unavailable"
          />
        </Field>
        <Field label="Allergies">
          <textarea
            rows={2}
            value={draft.allergies}
            onChange={(e) => setField("allergies", e.target.value)}
            className={inputClass}
            placeholder="Known allergies or None known"
          />
        </Field>
      </div>

      <Field label="Additional notes">
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => setField("notes", e.target.value)}
          className={inputClass}
          placeholder="Observed changes, interventions, or handoff notes"
        />
      </Field>

      <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <input
          type="checkbox"
          checked={unstable}
          onChange={(e) => {
            setUnstable(e.target.checked);
            setDirty(true);
            setSaveState("idle");
          }}
          className="h-5 w-5 rounded border-red-300 text-emergency focus:ring-emergency"
        />
        <span>
          <strong>Patient unstable</strong> — airway, arrest, uncontrolled
          bleeding, or immediate stabilization needed.
        </span>
      </label>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Missing before handoff
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {missing.length ? (
            missing.map((field) => (
              <Badge key={field} tone="amber">
                {field}
              </Badge>
            ))
          ) : (
            <Badge tone="green">Required fields complete</Badge>
          )}
        </div>
      </div>

      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="danger"
          disabled={saveState === "saving" || !dirty}
        >
          <Save aria-hidden className="mr-2 h-4 w-4" />
          {saveState === "saving" ? "Saving…" : "Save triage card"}
        </Button>
        {saveState === "saved" && (
          <span role="status" className="text-sm font-medium text-green-700">
            Saved and shared
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {required && <span className="ml-1 text-emergency">*</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-emergency focus:outline-none focus:ring-2 focus:ring-emergency/20";
