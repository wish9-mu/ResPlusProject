// Server-only: starts/stops Agora Real-Time STT agents over Agora's REST API.
// Uses AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET; never import from the client.
//
// Agora pushes transcripts into the RTC channel as data-stream messages (it has
// no per-segment server callback), so the BHW device decodes them and relays
// final segments to /api/transcripts. See src/lib/agora/stt-message.ts.
import { z } from "zod";
import { CALL_UIDS } from "./channel";
import { buildRtcToken, getAgoraAppId } from "./token";

const STT_BASE = "https://api.agora.io/api/speech-to-text/v1/projects";
// Filipino. Taglish accuracy is unverified (TECH_STACK.md known limits).
export const STT_LANGUAGES = ["fil-PH"];
// Agent stops itself if the channel is empty this long (abandoned call).
export const STT_MAX_IDLE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;

export const agentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export class SttUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "request_failed",
  ) {
    super(message);
    this.name = "SttUnavailableError";
  }
}

export function isSttConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_AGORA_APP_ID &&
      process.env.AGORA_APP_CERTIFICATE &&
      process.env.AGORA_CUSTOMER_ID &&
      process.env.AGORA_CUSTOMER_SECRET,
  );
}

function authHeader(): string {
  const id = process.env.AGORA_CUSTOMER_ID;
  const secret = process.env.AGORA_CUSTOMER_SECRET;
  if (!id || !secret) {
    throw new SttUnavailableError("STT credentials missing", "not_configured");
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function post(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof SttUnavailableError) throw error;
    throw new SttUnavailableError("STT request did not complete", "request_failed");
  }
  if (!res.ok) {
    // Status only: the response body is not needed and may echo request data.
    throw new SttUnavailableError(`STT request failed (${res.status})`, "request_failed");
  }
  return res.json().catch(() => ({}));
}

export async function startTranscription(
  channel: string,
  incidentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ agentId: string }> {
  if (!isSttConfigured()) {
    throw new SttUnavailableError("STT is not configured", "not_configured");
  }
  const appId = getAgoraAppId();
  const bot = buildRtcToken(channel, CALL_UIDS.stt);

  const json = (await post(
    `${STT_BASE}/${appId}/join`,
    {
      // Unique per start; no PII (incident id prefix + timestamp).
      name: `rp-${incidentId.slice(0, 8)}-${Date.now().toString(36)}`,
      languages: STT_LANGUAGES,
      maxIdleTime: STT_MAX_IDLE_SECONDS,
      enableJsonProtocol: true,
      rtcConfig: {
        channelName: channel,
        pubBotUid: String(CALL_UIDS.stt),
        pubBotToken: bot.token,
        subscribeAudioUids: [String(CALL_UIDS.household), String(CALL_UIDS.bhw)],
      },
    },
    fetchImpl,
  )) as { agent_id?: unknown; agentId?: unknown };

  const parsed = agentIdSchema.safeParse(json.agent_id ?? json.agentId);
  if (!parsed.success) {
    throw new SttUnavailableError("STT response had no agent id", "request_failed");
  }
  return { agentId: parsed.data };
}

export async function stopTranscription(
  agentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const appId = getAgoraAppId();
  await post(`${STT_BASE}/${appId}/agents/${agentId}/leave`, {}, fetchImpl);
}
