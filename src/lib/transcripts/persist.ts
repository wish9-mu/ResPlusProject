// Pure mapping from decoded STT segments to transcript_segments rows.
import { z } from "zod";
import { incidentIdSchema, speakerForUid } from "@/lib/agora/channel";
import type { TranscriptRow } from "@/lib/incidents/repo";

export const transcriptSegmentSchema = z.object({
  uid: z.number().int().nonnegative(),
  sentenceId: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(2000),
});

export const saveTranscriptSchema = z.object({
  incidentId: incidentIdSchema,
  // Final segments only; the client batches what arrived since the last save.
  segments: z.array(transcriptSegmentSchema).min(1).max(25),
});

export type TranscriptSegmentInput = z.infer<typeof transcriptSegmentSchema>;

// Same sentence fragment always yields the same key, so retries are no-ops.
export function sourceKey(s: TranscriptSegmentInput): string {
  return `${s.uid}:${s.sentenceId}:${s.offset}`;
}

export function toTranscriptRows(
  incidentId: string,
  segments: TranscriptSegmentInput[],
): TranscriptRow[] {
  const seen = new Set<string>();
  const rows: TranscriptRow[] = [];
  for (const s of segments) {
    const key = sourceKey(s);
    if (seen.has(key)) continue; // duplicate inside one batch
    seen.add(key);
    rows.push({
      incident_id: incidentId,
      speaker: speakerForUid(s.uid),
      text: s.text.trim(),
      source_key: key,
    });
  }
  return rows;
}
