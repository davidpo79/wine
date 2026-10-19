// Telnyx Call Control for admin → customer phone calls (same design as astro-dynamic-server's telnyxCallControl.js).
//
//   admin's browser  <--WebRTC (leg A)-->  Telnyx  <--PSTN (leg B)-->  customer
//
// The server dials the admin's own telephony credential (sip:<user>@sip.telnyx.com); the browser ANSWERS that leg.
// When leg A is answered (webhook), the server dials the customer with link_to + bridge_on_answer. The browser never
// originates a call: without a server-originated leg there is no call_control_id, no webhooks, no bridge.
//
// Two different Telnyx connections, never interchangeable:
//   TELNYX_WEBRTC_CONNECTION_ID  Credential Connection: holds the admins' telephony credentials (cannot do call control)
//   TELNYX_CONNECTION_ID         Call Control Application: connection_id of both dials (cannot hold credentials)
// Commands carry a command_id derived from the call id, so a replayed webhook re-issues the same command and Telnyx
// ignores the repeat.

import { outboundEnv as E } from "./outbound-settings";

export const TERMINAL = ["completed", "rep_no_answer", "no_answer", "busy", "failed", "canceled"] as const;

const base = () => (E().TELNYX_API_BASE ?? "https://api.telnyx.com/v2").replace(/\/$/, "");
const SIP_DOMAIN = () => E().TELNYX_SIP_DOMAIN || "sip.telnyx.com";
const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

export function humanCallConfig() {
  return {
    apiKey: E().TELNYX_API_KEY ?? "",
    webrtcConnectionId: E().TELNYX_WEBRTC_CONNECTION_ID ?? "",
    callControlConnectionId: E().TELNYX_CONNECTION_ID ?? "",
    fromNumber: E().TELNYX_FROM_NUMBER ?? "",
    webhookUrl: `${(E().SITE_URL ?? "").replace(/\/$/, "")}/api/telnyx/human-call-webhook`,
    // Telnyx's ~30 s default has cancelled mobiles before they stop ringing (SIP 487 at 30 s): the customer gets 60 s.
    repTimeoutSecs: num(E().HUMAN_CALL_REP_TIMEOUT_SECS, 30),
    customerTimeoutSecs: num(E().HUMAN_CALL_CUSTOMER_TIMEOUT_SECS, 60),
    timeLimitSecs: num(E().HUMAN_CALL_TIME_LIMIT_SECS, 3600), // counted from dial: a backstop, not a target
    amdMode: E().HUMAN_CALL_AMD_MODE || "premium",
    // Off unless set: in the EU the customer must be told before a call is recorded.
    record: E().HUMAN_CALL_RECORDING === "1",
  };
}

/** Names of the missing settings; empty = calling is configured. */
export function humanCallMissing() {
  const c = humanCallConfig();
  const missing: string[] = [];
  if (!c.apiKey) missing.push("TELNYX_API_KEY");
  if (!c.webrtcConnectionId) missing.push("TELNYX_WEBRTC_CONNECTION_ID");
  if (!c.callControlConnectionId) missing.push("TELNYX_CONNECTION_ID");
  if (!/^\+\d{7,15}$/.test(c.fromNumber)) missing.push("TELNYX_FROM_NUMBER");
  if (!/^https?:\/\/[^/]/.test(E().SITE_URL ?? "")) missing.push("SITE_URL");
  if (!E().TELNYX_PUBLIC_KEY) missing.push("TELNYX_PUBLIC_KEY");
  return missing;
}

/** status 0 = transport failure; a 4xx will not succeed on a retry. Never carries our request body. */
export class TelnyxError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TelnyxError";
  }
}

async function tx(method: string, path: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<Record<string, unknown> | string> {
  const key = E().TELNYX_API_KEY;
  if (!key) throw new TelnyxError("Telnyx is not configured (TELNYX_API_KEY not set)", 0);
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new TelnyxError(`Telnyx ${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`, 0);
  }
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = (text ? JSON.parse(text) : {}) ?? {};
  } catch {}
  if (!res.ok) {
    // Telnyx answers { errors: [{ code, title, detail }] }.
    const e = (json.errors as { detail?: string; title?: string }[] | undefined)?.[0];
    throw new TelnyxError(`Telnyx ${method} ${path} rejected (${res.status}): ${e?.detail || e?.title || text.slice(0, 200)}`, res.status);
  }
  // The token endpoint answers with the JWT as the whole body, unquoted: not JSON, so it must not go through parse.
  return opts.raw ? text : json;
}

const data = (r: Record<string, unknown> | string) => ((typeof r === "object" ? r.data : null) ?? {}) as Record<string, string | undefined>;

/** A leg that is already gone (404, or 422 "call is no longer active") is the outcome the command wanted. */
async function tolerant(path: string, body: unknown) {
  try {
    await tx("POST", path, body);
    return { ok: true, alreadyGone: false };
  } catch (e) {
    if (e instanceof TelnyxError && (e.status === 404 || e.status === 422)) return { ok: true, alreadyGone: true };
    throw e;
  }
}

const cc = (id: string) => `/calls/${encodeURIComponent(id)}/actions`;

// --- The admin's telephony credential (WebRTC) ---------------------------------------------------------------------

export async function createRepCredential(adminId: number) {
  const c = humanCallConfig();
  const r = await tx("POST", "/telephony_credentials", { connection_id: c.webrtcConnectionId, name: `wine-admin-${adminId}`.slice(0, 40), tag: `wine-admin:${adminId}` });
  const d = data(r);
  // sip_password is discarded: the browser logs in with a short-lived token minted from the credential.
  if (!d.id || !d.sip_username) throw new TelnyxError("Telnyx returned no credential id or SIP username", 0);
  return { credentialId: d.id, sipUsername: d.sip_username, connectionId: c.webrtcConnectionId };
}

export async function deleteRepCredential(credentialId: string) {
  try {
    await tx("DELETE", `/telephony_credentials/${encodeURIComponent(credentialId)}`);
  } catch (e) {
    if (!(e instanceof TelnyxError && e.status === 404)) throw e;
  }
}

const tokenShaped = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 8192 && !/[\s\x00-\x1f]/.test(v) && !"{[<".includes(v[0]) && !v.includes("<");

/** The body is the raw JWT (observed); a JSON string or { token } / { data: { token } } is accepted too. */
export function extractCredentialToken(rawBody: string) {
  const text = rawBody.trim();
  if (!text) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return tokenShaped(text) ? text : "";
  }
  const t =
    typeof parsed === "string"
      ? parsed.trim()
      : parsed && typeof parsed === "object"
        ? ((parsed as { token?: unknown }).token ?? (parsed as { data?: { token?: unknown } }).data?.token)
        : null;
  return tokenShaped(t) ? t.trim() : "";
}

/** Seconds until the JWT's own exp, or null when it cannot be read (not a validation: nothing checks the signature). */
export function tokenExpiresInSecs(token: string, nowMs = Date.now()) {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof p?.exp === "number" ? Math.max(0, Math.floor(p.exp - nowMs / 1000)) : null;
  } catch {
    return null;
  }
}

export async function mintRepToken(credentialId: string) {
  const raw = (await tx("POST", `/telephony_credentials/${encodeURIComponent(credentialId)}/token`, undefined, { raw: true })) as string;
  const token = extractCredentialToken(raw);
  // The body never goes into the message: it is either the credential itself or something unexpected.
  if (!token) throw new TelnyxError("Telnyx returned no credential token", 0);
  return { token, expiresInSecs: tokenExpiresInSecs(token) };
}

/** The host is always ours; the stored value is only a user part, validated rather than escaped. */
export function repSipUri(sipUsername: string) {
  const u = sipUsername.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(u)) throw new TelnyxError("that SIP username is not usable", 0);
  return `sip:${u}@${SIP_DOMAIN()}`;
}

// --- client_state ---------------------------------------------------------------------------------------------------

export type Leg = "rep" | "customer";
export const encodeClientState = (humanCallId: string, leg: Leg) => Buffer.from(JSON.stringify({ humanCallId, leg })).toString("base64");
export function decodeClientState(v: unknown): { humanCallId: string; leg: Leg } | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const o = JSON.parse(Buffer.from(v, "base64").toString("utf8"));
    if (!o || typeof o !== "object" || typeof o.humanCallId !== "string") return null;
    return { humanCallId: o.humanCallId, leg: o.leg === "rep" ? "rep" : "customer" };
  } catch {
    return null;
  }
}

// --- Dials and commands ---------------------------------------------------------------------------------------------

/** Leg A: rings the admin's browser. No `record` here: the recording is started on the customer leg at the bridge. */
export async function dialRepLeg(p: { callId: string; sipUsername: string }) {
  const c = humanCallConfig();
  const r = await tx("POST", "/calls", {
    connection_id: c.callControlConnectionId,
    to: repSipUri(p.sipUsername),
    from: c.fromNumber,
    webhook_url: c.webhookUrl,
    client_state: encodeClientState(p.callId, "rep"),
    command_id: `hc-rep-${p.callId}`,
    timeout_secs: c.repTimeoutSecs,
    time_limit_secs: c.timeLimitSecs,
  });
  const d = data(r);
  if (!d.call_control_id) throw new TelnyxError("Telnyx returned no call_control_id for the admin leg", 0);
  return { callControlId: d.call_control_id, callSessionId: d.call_session_id ?? null };
}

/** Leg B: the customer, bridged to leg A the moment they answer. */
/** `amd: false` leaves answering-machine detection off (it costs money per call). */
export async function dialCustomerLeg(p: { callId: string; to: string; linkTo: string; amd?: boolean }) {
  const c = humanCallConfig();
  if (!/^\+\d{7,15}$/.test(p.to)) throw new TelnyxError("the customer number must be E.164", 0);
  const r = await tx("POST", "/calls", {
    connection_id: c.callControlConnectionId,
    to: p.to,
    from: c.fromNumber,
    link_to: p.linkTo,
    bridge_on_answer: true,
    webhook_url: c.webhookUrl,
    client_state: encodeClientState(p.callId, "customer"),
    command_id: `hc-cust-${p.callId}`,
    timeout_secs: c.customerTimeoutSecs,
    time_limit_secs: c.timeLimitSecs,
    ...(p.amd === false ? {} : { answering_machine_detection: c.amdMode }),
  });
  const d = data(r);
  if (!d.call_control_id) throw new TelnyxError("Telnyx returned no call_control_id for the customer leg", 0);
  return { callControlId: d.call_control_id };
}

export async function startRecording(customerCallControlId: string, callId: string) {
  await tx("POST", `${cc(customerCallControlId)}/record_start`, { channels: "dual", format: "mp3", command_id: `hc-rec-${callId}` });
}

export const hangupLeg = (callControlId: string) => tolerant(`${cc(callControlId)}/hangup`, {});

// Ringback to the admin while the customer's phone rings: leg A is otherwise silent between answering and the bridge.
// Portuguese ringing tone: 425 Hz, 1 s on / 5 s off, 8 kHz 8-bit mono WAV, looped by Telnyx.
let ringback: string | null = null;
export function ringbackWav() {
  const rate = 8000;
  const tone = rate * 1;
  const pcm = Buffer.alloc(rate * 6, 128);
  const fade = Math.round(rate * 0.01);
  for (let i = 0; i < tone; i++) {
    const gain = i < fade ? i / fade : i > tone - fade ? (tone - i) / fade : 1;
    pcm[i] = Math.round(128 + 100 * gain * Math.sin((2 * Math.PI * 425 * i) / rate));
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export const startRingback = (repCallControlId: string, callId: string) =>
  tolerant(`${cc(repCallControlId)}/playback_start`, {
    playback_content: (ringback ??= ringbackWav().toString("base64")),
    audio_type: "wav",
    loop: "infinity",
    target_legs: "self",
    overlay: false,
    command_id: `hc-ringback-start-${callId}`,
  });

export const stopRingback = (repCallControlId: string, callId: string) =>
  tolerant(`${cc(repCallControlId)}/playback_stop`, { stop: "all", command_id: `hc-ringback-stop-${callId}` });

// --- Answering-machine verdict --------------------------------------------------------------------------------------

const MACHINE = ["machine", "machine_end_beep", "machine_end_silence", "machine_end_other"];
const HUMAN = ["human_residence", "human_business", "human"];

/** null when the event is not a verdict. Ambiguous results (not_sure, silence) are neither machine nor human. */
export function machineVerdict(eventType: string, payload: { result?: unknown }) {
  if (eventType !== "call.machine.detection.ended" && eventType !== "call.machine.premium.detection.ended") return null;
  const raw = String(payload?.result ?? "").trim().toLowerCase();
  return { result: raw || null, isMachine: MACHINE.includes(raw), isHuman: HUMAN.includes(raw) };
}

// --- Status from one webhook event ----------------------------------------------------------------------------------

export type CallStatus = "dialing" | "rep_ringing" | "rep_answered" | "customer_dialing" | "bridged" | (typeof TERMINAL)[number];
export const RANK: Record<string, number> = { dialing: 0, rep_ringing: 1, rep_answered: 2, customer_dialing: 3, bridged: 4 };
export const rankOf = (s: string) => RANK[s] ?? 5;
export const isTerminal = (s: string) => (TERMINAL as readonly string[]).includes(s);

/**
 * The status an event moves the call to, or null. Answering on the customer side is not a conversation:
 * only call.bridged is. Terminal rows never move.
 */
export function statusForEvent(type: string, payload: { hangup_cause?: unknown }, leg: Leg, current: string, reachedRepAnswered: boolean, reachedBridged: boolean): CallStatus | null {
  if (isTerminal(current)) return null;
  if (type === "call.initiated") return leg === "rep" ? "rep_ringing" : null;
  if (type === "call.answered") return leg === "rep" ? "rep_answered" : null;
  if (type === "call.bridged") return "bridged";
  if (type === "call.hangup") {
    if (reachedBridged) return "completed";
    if (leg === "rep") return reachedRepAnswered ? "canceled" : "rep_no_answer";
    const cause = String(payload?.hangup_cause ?? "").toLowerCase();
    if (["user_busy", "busy", "call_rejected", "rejected"].includes(cause)) return "busy";
    if (["originator_cancel", "cancel"].includes(cause)) return "canceled";
    return "no_answer";
  }
  return null;
}
