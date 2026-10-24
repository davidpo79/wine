import { verify as edVerify } from "node:crypto";
import { outboundEnv as E } from "./outbound-settings";
import { CONDUCT_RULE } from "./inbound-agent";

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
// Appended to every call's instructions: the call opens in the order's language, but the customer may answer in
// another one. The assistant's speech recognition detects the language and has a voice per language (Telnyx side).
export const LANGUAGE_RULE =
  "LANGUAGE: open in the language above, but if the person answers in another language or asks for one, switch to that language at once and keep it until the end of the call (always reply in the language of their last sentence, even if it is close to Portuguese, such as Spanish); never insist on Portuguese or Russian. All the rules above still apply in any language.\n" +
  "STYLE: this is a phone call. You already introduced yourself in the greeting, so never repeat the introduction (confirm you are an AI only if asked). Short natural sentences, one idea at a time, no lists, symbols or formatting. Answer exactly what the person said, ask at most one question at a time and never repeat a sentence you already said. Only talk about the product described above, never invent other wines or prices. If you hear an answering machine or voicemail, say goodbye in one sentence and stop.\n" +
  "FLOW: you lead the call and every reply moves it one step forward: answer what the person said, then add one relevant question or next step. Never reply with only a greeting, your name or a restatement of why you called. Steps: (1) after the greeting, ask what stopped them from finishing (a question about the wine, the price, delivery, payment, or simply no time); (2) answer that concern concretely with the facts above; (3) when they are ready, offer to send the payment link the way the instructions above say (SMS to the number you are calling, or email to the address they left on the site) and confirm they want it (never ask for their phone number, email or any personal data; if they ask for another channel such as WhatsApp, say kindly that it goes the way above); (4) close warmly in one sentence. If you did not understand, say so briefly and ask them to repeat. When you switch language, do not introduce yourself again: continue from the step you were at.\n" +
  "MEMORY: the greeting and everything said so far in this call really happened and the person heard it. Never start over: never say hello again, never say your name or that you are a virtual assistant again, never explain again why you called or what they left in the cart, and never ask again if they have a minute. Before each reply, check which step you are at and say only something new. If the speech-to-text looks garbled or mixed languages, do not restart: ask one short question in the language they seem to use, such as asking them to repeat or which language they prefer.";

// Sounding like a person: tone only, every rule above still applies.
export const HUMAN_RULE =
  "HUMAN TOUCH: sound like a warm, relaxed person from the shop, not a script. React briefly and naturally before answering (in the person's language, the equivalent of: of course, I see, great, no problem), show a little empathy when they mention a difficulty, use their first name now and then (not every sentence), vary your wording, and keep a light, friendly tone. Never sound salesy or read out a list of facts: pick the one detail that matters for what they said. Contractions and everyday words are fine.";

export async function startAssistant(callControlId: string, opts: { greeting: string; instructions: string; state: CallState; assistantId?: string | null }) {
  return call(`/calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`, {
    assistant: { id: opts.assistantId || E().TELNYX_ASSISTANT_ID, instructions: `${opts.instructions}\n\n${LANGUAGE_RULE}\n${HUMAN_RULE}\n${CONDUCT_RULE}` },
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
