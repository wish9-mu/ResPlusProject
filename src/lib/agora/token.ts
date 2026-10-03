// Server-only: builds short-lived Agora RTC tokens. Reads AGORA_APP_CERTIFICATE,
// which must never reach the browser. Do not import from client components.
import { RtcRole, RtcTokenBuilder } from "agora-token";

// 45 minutes. Clients renew before expiry via /api/agora/token.
export const TOKEN_TTL_SECONDS = 45 * 60;

export class AgoraConfigError extends Error {
  constructor(message = "Agora is not configured on the server.") {
    super(message);
    this.name = "AgoraConfigError";
  }
}

export function getAgoraAppId(): string {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  if (!appId) throw new AgoraConfigError();
  return appId;
}

export interface RtcTokenGrant {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  expiresAt: number; // unix seconds
}

export function buildRtcToken(
  channel: string,
  uid: number,
  ttlSeconds: number = TOKEN_TTL_SECONDS,
): RtcTokenGrant {
  const appId = getAgoraAppId();
  const certificate = process.env.AGORA_APP_CERTIFICATE;
  if (!certificate) throw new AgoraConfigError();

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    certificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    ttlSeconds, // seconds from now (AccessToken2 semantics)
    ttlSeconds,
  );
  return {
    appId,
    channel,
    uid,
    token,
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
}
