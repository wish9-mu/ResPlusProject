// Browser-only wrapper around the Agora Web SDK for one incident call.
// The SDK touches `window` on import, so it is loaded lazily inside start().
// Every failure ends in a named CallFailure so the UI can show the right
// fallback (tel: or 911). Nothing here blocks the emergency workflow.
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { CALL_UIDS, type CallRole } from "./channel";

export type CallState =
  | "idle"
  | "connecting"
  | "ringing"
  | "connected"
  | "ended"
  | "failed";

export type CallFailure =
  | "insecure_context" // mic needs HTTPS (or localhost)
  | "mic_denied"
  | "mic_unavailable"
  | "forbidden" // not allowed to join this incident
  | "not_configured" // Agora not set up on the server
  | "token" // token request failed
  | "timeout" // join took too long
  | "network"
  | "token_expired"
  | "unknown";

export interface TokenGrant {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  expiresAt: number;
}

export class TokenRequestError extends Error {
  constructor(readonly failure: CallFailure) {
    super(`Token request failed: ${failure}`);
    this.name = "TokenRequestError";
  }
}

export interface AgoraCallOptions {
  role: CallRole;
  fetchToken: () => Promise<TokenGrant>;
  onState: (state: CallState, failure?: CallFailure) => void;
  onReconnecting?: (reconnecting: boolean) => void;
  onStreamMessage?: (uid: number, payload: Uint8Array) => void;
}

export const JOIN_TIMEOUT_MS = 15_000;

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; name?: string; message?: string };
  return (
    e?.code === "PERMISSION_DENIED" ||
    e?.name === "NotAllowedError" ||
    /permission denied/i.test(e?.message ?? "")
  );
}

export class AgoraCall {
  private client: IAgoraRTCClient | null = null;
  private mic: IMicrophoneAudioTrack | null = null;
  private state: CallState = "idle";
  private finished = false;

  constructor(private readonly opts: AgoraCallOptions) {}

  private get remoteUid(): number {
    return this.opts.role === "household" ? CALL_UIDS.bhw : CALL_UIDS.household;
  }

  private setState(state: CallState, failure?: CallFailure) {
    this.state = state;
    this.opts.onState(state, failure);
  }

  async start(): Promise<void> {
    this.setState("connecting");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      return this.fail("insecure_context");
    }

    let AgoraRTC: typeof import("agora-rtc-sdk-ng").default;
    try {
      AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      AgoraRTC.setLogLevel(3); // warnings and errors only
    } catch {
      return this.fail("unknown");
    }

    // 1. Microphone first, so the permission prompt comes before any network.
    try {
      this.mic = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true, // echo cancellation
        ANS: true, // noise suppression
        AGC: true, // auto gain
      });
    } catch (error) {
      return this.fail(isPermissionError(error) ? "mic_denied" : "mic_unavailable");
    }
    if (this.finished) return this.cleanup();

    // 2. Short-lived token from our server (certificate never leaves it).
    let grant: TokenGrant;
    try {
      grant = await this.opts.fetchToken();
    } catch (error) {
      return this.fail(error instanceof TokenRequestError ? error.failure : "token");
    }
    if (this.finished) return this.cleanup();

    // 3. Client + event wiring.
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    this.client = client;

    client.on("user-joined", (user) => {
      if (user.uid === this.remoteUid) this.remoteArrived();
    });
    client.on("user-published", async (user, mediaType) => {
      if (mediaType !== "audio") return;
      try {
        await client.subscribe(user, "audio");
        user.audioTrack?.play();
      } catch {
        // Subscription hiccup: Agora re-publishes on reconnect.
      }
      if (user.uid === this.remoteUid) this.remoteArrived();
    });
    client.on("user-left", (user, reason) => {
      if (user.uid !== this.remoteUid) return;
      if (reason === "Quit") {
        void this.end(); // the other side hung up
      } else {
        this.opts.onReconnecting?.(true); // their network dropped
      }
    });
    client.on("connection-state-change", (cur, _prev, reason) => {
      if (cur === "RECONNECTING") this.opts.onReconnecting?.(true);
      if (cur === "CONNECTED") this.opts.onReconnecting?.(false);
      if (cur === "DISCONNECTED" && !this.finished && reason !== "LEAVE") {
        void this.fail("network");
      }
    });
    client.on("token-privilege-will-expire", async () => {
      try {
        const next = await this.opts.fetchToken();
        await client.renewToken(next.token);
      } catch {
        // If renewal fails, did-expire below ends the call cleanly.
      }
    });
    client.on("token-privilege-did-expire", () => void this.fail("token_expired"));
    client.on("stream-message", (uid, payload) => {
      this.opts.onStreamMessage?.(Number(uid), payload);
    });

    // 4. Join the incident channel, then publish the mic.
    try {
      await withTimeout(
        client.join(grant.appId, grant.channel, grant.token, grant.uid),
        JOIN_TIMEOUT_MS,
      );
      if (this.finished) return this.cleanup();
      await client.publish([this.mic]);
    } catch (error) {
      return this.fail(error instanceof TimeoutError ? "timeout" : "network");
    }

    const remoteHere = client.remoteUsers.some((u) => u.uid === this.remoteUid);
    this.setState(remoteHere ? "connected" : "ringing");
  }

  private remoteArrived() {
    this.opts.onReconnecting?.(false);
    if (this.state === "ringing") this.setState("connected");
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.mic?.setMuted(muted);
  }

  async end(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.cleanup();
    this.setState("ended");
  }

  private async fail(failure: CallFailure): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.cleanup();
    this.setState("failed", failure);
  }

  private async cleanup(): Promise<void> {
    try {
      this.mic?.close();
    } catch {
      /* already closed */
    }
    this.mic = null;
    const client = this.client;
    this.client = null;
    if (client) {
      client.removeAllListeners();
      await client.leave().catch(() => undefined);
    }
  }
}
