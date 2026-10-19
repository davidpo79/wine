// The admin's browser telephony device (same design as astro-dynamic-dashboard's src/lib/softphone.ts).
//
// THE BROWSER LEG IS INBOUND: the server dials this device (leg A), the device answers, and only then does the server
// dial the customer and bridge the two. There is no newCall and no destination here on purpose: a browser-originated
// call has no call_control_id, so it would lose the webhooks, the bridge and the recording.
// This device never decides that a call is CONNECTED (the browser has audio as soon as leg A is answered, before the
// customer's phone even rings): `connected` comes from POST /admin/calls/state only.
// No browser global is touched at module scope; the SDK arrives through a dynamic import.

export type SoftphoneEvent =
  | { type: "ready" }
  | { type: "error" }
  | { type: "incoming"; call: SoftphoneCall }
  | { type: "legEnded" }
  | { type: "socketClosed" };

export interface SoftphoneCall {
  answer(options: { remoteElement: HTMLMediaElement }): void | Promise<void>;
  hangup(): void | Promise<void>;
  muteAudio(): void;
  unmuteAudio(): void;
}

export interface SoftphoneClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(handler: (event: SoftphoneEvent) => void): void;
  /** Hands a fresh login token to the live session so the SDK's own reconnects do not use an expired one. */
  refreshToken(loginToken: string): Promise<void>;
}

interface TelnyxLikeCall {
  answer(params: { remoteElement?: HTMLMediaElement }): void;
  hangup(): Promise<void> | void;
  muteAudio(): void;
  unmuteAudio(): void;
  state?: string;
}

interface TelnyxLikeClient {
  on(event: string, handler: (payload: unknown) => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  login?(params: { creds?: { login_token?: string }; onSuccess?: () => void; onError?: (error: unknown) => void }): Promise<void>;
  readonly connected?: boolean;
}

export const TOKEN_FEED_TIMEOUT_MS = 10_000;

export async function createSoftphone(loginToken: string): Promise<SoftphoneClient> {
  const mod = (await import("@telnyx/webrtc")) as unknown as { TelnyxRTC: new (options: { login_token: string }) => TelnyxLikeClient };
  const client = new mod.TelnyxRTC({ login_token: loginToken });
  let emit: ((event: SoftphoneEvent) => void) | null = null;

  client.on("telnyx.ready", () => emit?.({ type: "ready" }));
  client.on("telnyx.socket.close", () => emit?.({ type: "socketClosed" }));
  // The SDK's error text is never shown to the admin.
  client.on("telnyx.error", () => emit?.({ type: "error" }));
  client.on("telnyx.notification", (payload: unknown) => {
    const n = payload as { type?: string; call?: TelnyxLikeCall } | null;
    if (!n || n.type !== "callUpdate" || !n.call) return;
    const call = n.call;
    const state = String(call.state ?? "");
    // `ringing` is the server's leg A arriving: the only call this device ever sees.
    if (state === "ringing")
      emit?.({
        type: "incoming",
        call: {
          answer: (o) => call.answer({ remoteElement: o.remoteElement }),
          hangup: () => call.hangup(),
          muteAudio: () => call.muteAudio(),
          unmuteAudio: () => call.unmuteAudio(),
        },
      });
    else if (state === "hangup" || state === "destroy") emit?.({ type: "legEnded" });
  });

  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    on: (handler) => {
      emit = handler;
    },
    refreshToken: (token) =>
      new Promise<void>((resolve, reject) => {
        if (typeof client.login !== "function" || client.connected === false) return reject(new Error("socket-not-alive"));
        // A dead socket makes login() a silent no-op: the timeout is the only way to learn the token was not taken.
        const timer = setTimeout(() => reject(new Error("token-feed-timeout")), TOKEN_FEED_TIMEOUT_MS);
        void Promise.resolve(
          client.login({
            creds: { login_token: token },
            onSuccess: () => {
              clearTimeout(timer);
              resolve();
            },
            onError: () => {
              clearTimeout(timer);
              reject(new Error("token-feed-refused"));
            },
          }),
        ).catch(() => {
          clearTimeout(timer);
          reject(new Error("token-feed-refused"));
        });
      }),
  };
}

/** Microphone at registration, not at call time: a permission prompt while the customer's phone rings is a lost call. */
export async function requestMicrophone(): Promise<MediaStream> {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!media?.getUserMedia) throw new Error("no-media-devices");
  return media.getUserMedia({ audio: true });
}

export function stopStream(stream: MediaStream | null) {
  for (const t of stream?.getTracks() ?? []) {
    try {
      t.stop();
    } catch {}
  }
}

/**
 * The remote <audio>, created during the Connect click: first touched while answering, the browser may block it as
 * autoplay and the admin hears nothing. Off-screen rather than display:none (some engines drop hidden media).
 */
export function createRemoteAudioElement(): HTMLMediaElement | null {
  if (typeof document === "undefined") return null;
  const el = document.createElement("audio");
  el.autoplay = true;
  Object.assign(el.style, { position: "fixed", width: "1px", height: "1px", top: "-100px", left: "-100px" });
  document.body.appendChild(el);
  return el;
}

export function destroyRemoteAudioElement(el: HTMLMediaElement | null) {
  try {
    if (el) {
      el.srcObject = null;
      el.remove();
    }
  } catch {}
}
