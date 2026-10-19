// Portugal HR callers: telephony on the project's OWN Telnyx account
// (spec section 6: a separate Telnyx account for this project). Every value is
// PT_TELNYX_*; the shop's TELNYX_* account is never used, not even as a
// fallback.
//
// The click-to-call shape (ported from the AstroDynamic CRM's human calls):
//   1. leg A rings the rep's own registered browser (a Telnyx WebRTC
//      credential, one per team member, in pt_phone_endpoints);
//   2. only when the rep answers does the server re-check everything and
//      dial leg B, the lead, with link_to + bridge_on_answer.
// The browser never dials; it registers with a short-lived token and answers.
//
// Deliberately absent: recording, transcription, answering-machine detection,
// SMS, WhatsApp, automatic or power dialling. Nothing here creates or edits a
// number, profile or connection at Telnyx: only the per-member browser
// credential is created, on the WebRTC connection David configures.
import { verifyTelnyxWebhook } from "@/lib/telnyx";
import { isDialablePtE164 } from "./phone";
import type { Dialer } from "./service";
import type { Env } from "./flags";

const API = "https://api.telnyx.com/v2";
const SIP_DOMAIN = "sip.telnyx.com";
const REP_TIMEOUT_SECS = 30;
const LEAD_TIMEOUT_SECS = 30;
const TIME_LIMIT_SECS = 1800;

export class DialError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status; }
}

export type PhoneEndpoint = { uid: string; sipUsername: string; credentialId: string; connectionId: string; active: boolean; createdAt: number; updatedAt: number };
export interface EndpointStore {
  get(uid: string): Promise<PhoneEndpoint | null>;
  /** Inserts unless the member already has one; returns the row that stands. */
  claim(row: PhoneEndpoint): Promise<{ claimed: boolean; endpoint: PhoneEndpoint }>;
}

export function createMemoryEndpointStore(): EndpointStore {
  const rows = new Map<string, PhoneEndpoint>();
  return {
    async get(uid) { return rows.get(uid) ?? null; },
    async claim(row) {
      const ex = rows.get(row.uid);
      if (ex) return { claimed: false, endpoint: ex };
      rows.set(row.uid, row);
      return { claimed: true, endpoint: row };
    },
  };
}

export const encodeClientState = (callId: string, leg: "rep" | "customer") => Buffer.from(`ptc:${callId}:${leg}`).toString("base64");
export function decodeClientState(cs: unknown): { callId: string; leg: "rep" | "customer" } | null {
  if (typeof cs !== "string" || !cs) return null;
  const m = Buffer.from(cs, "base64").toString("utf8").match(/^ptc:(ptc_[A-Za-z0-9_]{1,64}):(rep|customer)$/);
  return m ? { callId: m[1], leg: m[2] as "rep" | "customer" } : null;
}

function extractToken(raw: string): string {
  const shaped = (s: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
  const text = raw.trim();
  if (shaped(text)) return text;
  try {
    const p = JSON.parse(text);
    const v = typeof p === "string" ? p : p?.token ?? p?.data?.token;
    return typeof v === "string" && shaped(v.trim()) ? v.trim() : "";
  } catch { return ""; }
}

export function createPtDialer(o: { env: () => Env; fetchImpl?: typeof fetch; endpoints: EndpointStore; now?: () => number }): Dialer {
  const doFetch = o.fetchImpl ?? fetch;
  const now = o.now ?? (() => Date.now());
  function cfg() {
    const e = o.env();
    const apiKey = (e.PT_TELNYX_API_KEY ?? "").trim();
    const connectionId = (e.PT_TELNYX_CONNECTION_ID ?? "").trim();
    if (!apiKey || !connectionId) throw new DialError("pt_telephony_not_configured", 503);
    const from = (e.PT_TELNYX_FROM_NUMBER ?? "").trim();
    if (!from) throw new DialError("pt_from_number_missing", 503);
    if (!/^\+351\d{9}$/.test(from)) throw new DialError("pt_from_number_not_pt", 503);
    const site = (e.SITE_URL ?? "").trim().replace(/\/+$/, "");
    return { apiKey, connectionId, from, webrtcConnectionId: (e.PT_TELNYX_WEBRTC_CONNECTION_ID ?? "").trim(), webhookUrl: `${site}/api/pt-callers/telnyx-webhook` };
  }
  async function api(apiKey: string, path: string, method: string, body?: unknown) {
    const r = await doFetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    // The provider's body is not forwarded: it may carry a credential.
    if (!r.ok) throw new DialError(`telnyx_http_${r.status}`, 502);
    return text;
  }
  async function endpointFor(uid: string, webrtcConnectionId: string) {
    let ep: PhoneEndpoint | null;
    try { ep = await o.endpoints.get(uid); } catch { throw new DialError("device_registry_unavailable", 503); }
    if (!ep) throw new DialError("no_device");
    if (!ep.active) throw new DialError("device_revoked", 403);
    if (webrtcConnectionId && ep.connectionId !== webrtcConnectionId) throw new DialError("device_wrong_account", 409);
    return ep;
  }
  const leg = (text: string) => ({ callControlId: (JSON.parse(text || "{}")?.data?.call_control_id as string) ?? null });

  return {
    async startRepLeg({ callId, uid }) {
      const c = cfg();
      const ep = await endpointFor(uid, c.webrtcConnectionId);
      return leg(await api(c.apiKey, "/calls", "POST", {
        connection_id: c.connectionId, to: `sip:${ep.sipUsername}@${SIP_DOMAIN}`, from: c.from,
        webhook_url: c.webhookUrl, client_state: encodeClientState(callId, "rep"), command_id: `${callId}-rep`,
        timeout_secs: REP_TIMEOUT_SECS, time_limit_secs: TIME_LIMIT_SECS,
      }));
    },
    async dialCustomer({ callId, to, linkTo }) {
      const c = cfg();
      if (!isDialablePtE164(to)) throw new DialError("phone_not_pt_e164");
      return leg(await api(c.apiKey, "/calls", "POST", {
        connection_id: c.connectionId, to, from: c.from, link_to: linkTo, bridge_on_answer: true,
        webhook_url: c.webhookUrl, client_state: encodeClientState(callId, "customer"), command_id: `${callId}-customer`,
        timeout_secs: LEAD_TIMEOUT_SECS, time_limit_secs: TIME_LIMIT_SECS,
      }));
    },
    async hangup(callControlId) {
      const c = cfg();
      await api(c.apiKey, `/calls/${encodeURIComponent(callControlId)}/actions/hangup`, "POST", {});
    },
    // First use creates one credential on the WebRTC connection; a race is
    // decided by the database and the loser's credential is deleted. A revoked
    // member is refused before anything is created.
    async mintToken(uid) {
      const c = cfg();
      if (!c.webrtcConnectionId) throw new DialError("pt_telephony_not_configured", 503);
      let ep: PhoneEndpoint | null;
      try { ep = await o.endpoints.get(uid); } catch { throw new DialError("device_registry_unavailable", 503); }
      if (ep && !ep.active) throw new DialError("device_revoked", 403);
      if (!ep) {
        const created = JSON.parse(await api(c.apiKey, "/telephony_credentials", "POST", {
          connection_id: c.webrtcConnectionId, name: `pt-caller-${uid}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 48), tag: `pt-caller:${uid}`,
        }))?.data;
        if (!created?.id || !created?.sip_username) throw new DialError("telnyx_credential_missing", 502);
        const t = now();
        const claim = await o.endpoints.claim({ uid, sipUsername: String(created.sip_username), credentialId: String(created.id), connectionId: c.webrtcConnectionId, active: true, createdAt: t, updatedAt: t });
        if (!claim.claimed) await api(c.apiKey, `/telephony_credentials/${encodeURIComponent(String(created.id))}`, "DELETE").catch(() => {});
        ep = claim.endpoint;
      }
      if (ep.connectionId !== c.webrtcConnectionId) throw new DialError("device_wrong_account", 409);
      const token = extractToken(await api(c.apiKey, `/telephony_credentials/${encodeURIComponent(ep.credentialId)}/token`, "POST"));
      if (!token) throw new DialError("telnyx_token_missing", 502);
      return { token, expiresInSecs: null };
    },
  };
}

/** The PT call webhook: verified with the PT account's key only, then forwarded to the service. */
export async function handlePtTelnyxWebhook(
  raw: string,
  headers: Record<string, string | null | undefined>,
  o: { env: () => Env; service: { onCallEvent(e: { callId: string; leg: "rep" | "customer"; type: "answered" | "hangup"; callControlId: string | null }): Promise<unknown> } },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const key = (o.env().PT_TELNYX_PUBLIC_KEY ?? "").trim();
  if (!key || !verifyTelnyxWebhook(raw, headers["telnyx-signature-ed25519"] ?? null, headers["telnyx-timestamp"] ?? null, key)) {
    return { status: 401, body: { error: "invalid signature" } };
  }
  let evt: any;
  try { evt = JSON.parse(raw)?.data; } catch { return { status: 200, body: { ok: true } }; }
  const p = evt?.payload ?? {};
  const tag = decodeClientState(p.client_state);
  const type = evt?.event_type === "call.answered" ? "answered" : evt?.event_type === "call.hangup" ? "hangup" : null;
  if (tag && type) await o.service.onCallEvent({ callId: tag.callId, leg: tag.leg, type, callControlId: p.call_control_id ?? null }).catch(() => {});
  return { status: 200, body: { ok: true } };
}
