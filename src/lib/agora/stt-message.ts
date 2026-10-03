// Decodes Agora Real-Time STT data-stream messages (JSON protocol, started with
// enableJsonProtocol: true). Runs in the browser; pure apart from gunzip.
//
// Message shape (Agora docs, "Parse transcription data"):
//   { transcript: { uid, sentenceId, isFinal, text, offset,
//                   results: [{ text, isFinal, offset, duration }] } }
// Payloads may be gzip-compressed. One message can hold several segments.

export interface SttSegment {
  uid: number;
  sentenceId: number;
  offset: number; // ms from the start of the agent's audio
  text: string;
  isFinal: boolean;
}

export class SttDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttDecodeError";
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function decodeSttPayload(
  payload: Uint8Array,
): Promise<SttSegment[]> {
  let bytes = payload;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = await gunzip(bytes);
  }

  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SttDecodeError("STT message is not JSON");
  }

  const transcript = (message as { transcript?: Record<string, unknown> })
    ?.transcript;
  if (!transcript || typeof transcript !== "object") return []; // e.g. translation

  const uid = toInt(transcript.uid, -1);
  const sentenceId = toInt(transcript.sentenceId ?? transcript.textTs);
  const results = Array.isArray(transcript.results)
    ? (transcript.results as Record<string, unknown>[])
    : [];
  const raw =
    results.length > 0
      ? results
      : [{ text: transcript.text, isFinal: transcript.isFinal, offset: transcript.offset }];

  return raw
    .map((r) => ({
      uid,
      sentenceId,
      offset: toInt(r.offset),
      text: typeof r.text === "string" ? r.text.trim() : "",
      isFinal: r.isFinal === true,
    }))
    .filter((s) => s.text.length > 0);
}
