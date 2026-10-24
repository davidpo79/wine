import { verify as edVerify } from "node:crypto";
import { outboundEnv as E } from "./outbound-settings";

const API = "https://api.telnyx.com/v2";

export function telnyxConfigured(kind: "sms" | "voice") {
  if (!E().TELNYX_API_KEY || !E().TELNYX_FROM_NUMBER) return false;
  if (kind === "voice") return Boolean(E().TELNYX_CONNECTION_ID && E().TELNYX_ASSISTANT_ID);
  return true;
}

async function call(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${E().TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`Telnyx ${path} ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

export async function sendSms(to: string, text: string) {
  const body: Record<string, unknown> = { from: E().TELNYX_FROM_NUMBER, to, text };
  if (E().TELNYX_MESSAGING_PROFILE_ID) body.messaging_profile_id = E().TELNYX_MESSAGING_PROFILE_ID;
  return call("/messages", body);
}

export type CallState = { orderId: string; stepId: number };

export const encodeState = (s: CallState) => Buffer.from(JSON.stringify(s)).toString("base64");
export function decodeState(v?: string | null): CallState | null {
  if (!v) return null;
  try {
    return JSON.parse(Buffer.from(v, "base64").toString());
  } catch {
    return null;
  }
}

/** Outbound call; the AI assistant is started from the webhook once a human answers. */
export async function dialCall(to: string, state: CallState) {
  return call("/calls", {
    connection_id: E().TELNYX_CONNECTION_ID,
    to,
    from: E().TELNYX_FROM_NUMBER,
    webhook_url: `${(E().SITE_URL ?? "").replace(/\/$/, "")}/api/telnyx/webhook`,
    client_state: encodeState(state),
    answering_machine_detection: "detect",
    timeout_secs: 30,
  });
}

/**
 * Which Telnyx AI assistant speaks an order's language. The voice and the speech-recognition language live on the
 * assistant in Telnyx, so each language has its own: Portuguese TELNYX_ASSISTANT_ID, Russian TELNYX_ASSISTANT_ID_RU
 * (Admin → Settings → Outbound calls). Not set, or any other language: null, no AI call.
 */
export function assistantFor(locale: string): string | null {
  const env = E();
  if (locale === "pt") return env.TELNYX_ASSISTANT_ID || null;
  if (locale === "ru") return env.TELNYX_ASSISTANT_ID_RU || null;
  return null;
}

/** assistantId: assistantFor(order locale); the Portuguese assistant when not given. */
export async function startAssistant(callControlId: string, opts: { greeting: string; instructions: string; state: CallState; assistantId?: string | null }) {
  return call(`/calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`, {
    assistant: { id: opts.assistantId || E().TELNYX_ASSISTANT_ID, instructions: opts.instructions },
    greeting: opts.greeting,
    client_state: encodeState(opts.state),
    command_id: `ai_${opts.state.orderId}_${opts.state.stepId}`,
  });
}

export async function hangup(callControlId: string) {
  return call(`/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {});
}

/** Verifies Telnyx webhook signatures (Ed25519 over "timestamp|body"). Requires TELNYX_PUBLIC_KEY (base64). */
export function verifyTelnyxWebhook(rawBody: string, signatureB64: string | null, timestamp: string | null) {
  const pub = E().TELNYX_PUBLIC_KEY;
  if (!pub || !signatureB64 || !timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pub, "base64")]);
    return edVerify(null, Buffer.from(`${timestamp}|${rawBody}`), { key: spki, format: "der", type: "spki" }, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
