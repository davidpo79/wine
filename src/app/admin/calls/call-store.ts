"use client";

// One device and one call per admin tab (same flow as astro-dynamic-dashboard's stores/humanCall.ts):
//   Connect (click) → microphone → remote <audio> → POST webrtc-token → SDK connect → wait for `ready`
//   Call → POST start { orderId | leadId } → the server rings this device → auto-answer → poll state every 2 s
//   End call → hang up our own leg; the server learns it from the webhook and hangs up the customer.
import { useSyncExternalStore } from "react";
import { createRemoteAudioElement, createSoftphone, destroyRemoteAudioElement, requestMicrophone, stopStream, type SoftphoneCall, type SoftphoneClient } from "@/lib/softphone";

export type CallTarget = { orderId?: string; leadId?: number; ptLeadId?: number; name: string; lang?: "pt" };
export type Device = "idle" | "registering" | "ready" | "micDenied" | "forbidden" | "unavailable" | "connectionLost";
export type CallView = {
  target: CallTarget;
  phase: "needsDevice" | "registering" | "starting" | "startFailed" | "repBusy" | "voicemail" | string;
  callId: string | null;
  status: string | null;
  connected: boolean;
  connectedAt: string | null;
  durationMs: number | null;
  error: string | null; // shown verbatim (dialError) or a closed token
  answeredBy: string | null;
};
type State = { device: Device; deviceError: string | null; call: CallView | null; muted: boolean };

const TERMINAL = ["completed", "rep_no_answer", "no_answer", "busy", "failed", "canceled"];
const POLL_MS = 2000;
const READY_TIMEOUT_MS = 10_000;

let state: State = { device: "idle", deviceError: null, call: null, muted: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const setCall = (patch: Partial<CallView>) => state.call && set({ call: { ...state.call, ...patch } });

let client: SoftphoneClient | null = null;
let mic: MediaStream | null = null;
let audioEl: HTMLMediaElement | null = null;
let leg: SoftphoneCall | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let onReady: (() => void) | null = null;

export const isLive = (c: CallView | null) => !!c && !!c.status && !TERMINAL.includes(c.status) && !["starting", "dialing"].includes(c.status);

async function post(path: string, body: unknown = {}) {
  const r = await fetch(`/admin/calls/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

type Minted = { ok: true; token: string; expiresInSecs: number | null } | { ok: false; error: number; message: string | null };
async function mintToken(): Promise<Minted> {
  const r = await post("webrtc-token");
  if (r.status !== 200 || typeof r.json.token !== "string") return { ok: false, error: r.status, message: (r.json.error as string) ?? null };
  return { ok: true, token: r.json.token, expiresInSecs: typeof r.json.expiresInSecs === "number" ? r.json.expiresInSecs : null };
}

function scheduleRefresh(expiresInSecs: number | null) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = expiresInSecs ? Math.max(10, expiresInSecs / 2) * 1000 : 30 * 60_000;
  refreshTimer = setTimeout(async () => {
    const t = await mintToken().catch(() => null);
    if (t?.ok && client) {
      await client.refreshToken(t.token).catch(() => {});
      scheduleRefresh(t.expiresInSecs);
    } else scheduleRefresh(null);
  }, ms);
}

function onDeviceEvent(e: Parameters<Parameters<SoftphoneClient["on"]>[0]>[0]) {
  if (e.type === "ready") {
    set({ device: "ready", deviceError: null });
    onReady?.();
  } else if (e.type === "incoming") {
    // Leg A from our own server: answer it straight away into the <audio> made during the Connect click.
    leg = e.call;
    if (audioEl) void Promise.resolve(e.call.answer({ remoteElement: audioEl })).catch(() => {});
  } else if (e.type === "legEnded") {
    leg = null; // not a call state: the server's status says how the call ended
    set({ muted: false });
  } else if (e.type === "socketClosed") {
    set({ device: "connectionLost" });
  }
}

/** Must run inside a click: the microphone prompt and the audio unlock both need the user gesture. */
export async function register(): Promise<boolean> {
  if (state.device === "ready") return true;
  set({ device: "registering", deviceError: null });
  try {
    mic = await requestMicrophone();
  } catch {
    set({ device: "micDenied", deviceError: "Allow the microphone for this site to make calls." });
    return false;
  }
  audioEl ??= createRemoteAudioElement();
  const t: Minted = await mintToken().catch(() => ({ ok: false, error: 0, message: null }));
  if (!t.ok) {
    set({ device: t.error === 403 ? "forbidden" : "unavailable", deviceError: t.message ?? "Calling is unavailable right now." });
    return false;
  }
  try {
    await client?.disconnect().catch(() => {});
    client = await createSoftphone(t.token);
    client.on(onDeviceEvent);
    const ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
      onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
    await client.connect();
    // connect() resolving is not enough: the device can be rung only after `ready`.
    if (!(await ready)) throw new Error("ready-timeout");
    scheduleRefresh(t.expiresInSecs);
    return true;
  } catch {
    set({ device: "unavailable", deviceError: "Could not connect your calling device. Try again." });
    return false;
  }
}

/** Opens the popup; dials at once when the device is ready, otherwise the popup asks to Connect (a click). */
export function call(target: CallTarget) {
  if (isLive(state.call)) return;
  set({ call: { target, phase: "needsDevice", callId: null, status: null, connected: false, connectedAt: null, durationMs: null, error: null, answeredBy: null }, muted: false });
  if (state.device === "ready") void placeCall();
}

export async function connectAndCall() {
  setCall({ phase: "registering" });
  if (await register()) await placeCall();
  else setCall({ phase: "needsDevice" });
}

async function placeCall() {
  const c = state.call;
  if (!c) return;
  setCall({ phase: "starting", status: "starting" });
  if (c.target.ptLeadId) return placePtCall(c.target.ptLeadId);
  const r = await post("start", c.target.orderId ? { orderId: c.target.orderId } : { leadId: c.target.leadId }).catch(() => ({ status: 0, json: {} as Record<string, unknown> }));
  if (r.status === 409 && r.json.code === "rep_busy") return setCall({ phase: "repBusy", status: null, callId: (r.json.activeCallId as string) ?? null });
  if (r.status !== 200) return setCall({ phase: "startFailed", status: null, error: (r.json.error as string) ?? "The call could not be started." });
  const callId = r.json.callId as string;
  if (r.json.dialed === false) return setCall({ callId, phase: "failed", status: "failed", error: (r.json.dialError as string) ?? null });
  setCall({ callId, phase: r.json.status as string, status: r.json.status as string });
  schedulePoll();
}

/** Portugal-callers lead: the rep's own endpoint rechecks every rule on the server before ringing this device. */
async function placePtCall(leadId: number) {
  const r = await fetch("/admin/pt-callers/api/rep/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }), credentials: "include" })
    .then(async (x) => ({ status: x.status, json: (await x.json().catch(() => ({}))) as Record<string, unknown> }))
    .catch(() => ({ status: 0, json: {} as Record<string, unknown> }));
  if (r.status !== 200 || r.json.ok !== true) {
    const reason = String(r.json.reason ?? "call_failed");
    return setCall({ phase: reason === "busy" ? "repBusy" : "startFailed", status: null, callId: (r.json.callId as string) ?? null, error: (r.json.dialError as string) ?? `pt:${reason}` });
  }
  setCall({ callId: r.json.callId as string, phase: r.json.status as string, status: r.json.status as string });
  schedulePoll();
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollState, POLL_MS);
}

async function pollState() {
  const c = state.call;
  if (!c?.callId) return;
  const r = await post("state", { callId: c.callId }).catch(() => null);
  if (!r) return schedulePoll(); // transient: keep polling
  if (r.status === 404) return;
  const s = r.json.state as Record<string, unknown> | undefined;
  if (s) {
    const status = String(s.status);
    const voicemail = status === "bridged" && s.answeredBy === "machine" && s.likelyVoicemail === true;
    setCall({
      status,
      phase: voicemail ? "voicemail" : status,
      connected: s.connected === true,
      connectedAt: (s.connectedAt as string) ?? null,
      durationMs: (s.durationMs as number) ?? null,
      answeredBy: (s.answeredBy as string) ?? null,
      error: c.error ?? ((s.error as string) || null),
    });
    if (TERMINAL.includes(status)) {
      if (leg) void Promise.resolve(leg.hangup()).catch(() => {});
      return;
    }
  }
  schedulePoll();
}

export function hangUp() {
  if (leg) void Promise.resolve(leg.hangup()).catch(() => {});
}

export function toggleMute() {
  if (!leg) return;
  if (state.muted) leg.unmuteAudio();
  else leg.muteAudio();
  set({ muted: !state.muted });
}

export function close() {
  if (isLive(state.call)) return;
  if (pollTimer) clearTimeout(pollTimer);
  set({ call: null, muted: false });
}

export function disconnectDevice() {
  if (isLive(state.call)) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  void client?.disconnect().catch(() => {});
  client = null;
  stopStream(mic);
  mic = null;
  destroyRemoteAudioElement(audioEl);
  audioEl = null;
  set({ device: "idle" });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;
const serverSnapshot: State = { device: "idle", deviceError: null, call: null, muted: false };
export const useCallStore = () => useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
