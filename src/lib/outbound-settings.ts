// Admin → Settings → Outbound calls. The non-secret call settings live in the settings table (key "outbound_calls")
// and override the Railway variable of the same name when set; a field left empty falls back to Railway.
// API keys are NOT here: TELNYX_API_KEY and APOLLO_API_KEY stay Railway-only (the screen shows set / not set).
// Single replica: the values are loaded at boot and refreshed on every save, so every request sees them at once.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const OUTBOUND_FIELDS = [
  // Telnyx, shared by the admin browser phone (#4), the Portugal callers and the AI recovery call
  { key: "TELNYX_FROM_NUMBER", group: "telnyx", label: "Caller ID (from number)", kind: "text", hint: "E.164, e.g. +351210000000" },
  { key: "TELNYX_CONNECTION_ID", group: "telnyx", label: "Call Control application id", kind: "text", hint: "Places every call (Telnyx → Voice → Call Control)" },
  { key: "TELNYX_WEBRTC_CONNECTION_ID", group: "telnyx", label: "WebRTC credential connection id", kind: "text", hint: "Holds the admins' browser phones (a Credential Connection, not the Call Control app)" },
  { key: "TELNYX_PUBLIC_KEY", group: "telnyx", label: "Webhook public key", kind: "text", hint: "Base64 Ed25519 public key (Telnyx → Account → Keys). Public, not a secret." },
  { key: "TELNYX_ASSISTANT_ID", group: "telnyx", label: "AI assistant id (abandoned-checkout call)", kind: "text", hint: "" },
  // Admin → customer calls
  { key: "HUMAN_CALL_RECORDING", group: "human", label: "Record admin → customer calls", kind: "bool01", hint: "Tell the customer first (EU). Portugal-callers calls are never recorded." },
  { key: "HUMAN_CALL_REP_TIMEOUT_SECS", group: "human", label: "Your phone rings for (seconds)", kind: "int", hint: "Default 30" },
  { key: "HUMAN_CALL_CUSTOMER_TIMEOUT_SECS", group: "human", label: "Customer's phone rings for (seconds)", kind: "int", hint: "Default 60 (Telnyx's 30 s cuts mobiles off)" },
  { key: "HUMAN_CALL_TIME_LIMIT_SECS", group: "human", label: "Maximum call length (seconds)", kind: "int", hint: "Default 3600" },
  { key: "HUMAN_CALL_AMD_MODE", group: "human", label: "Answering-machine detection", kind: "select", options: ["premium", "detect", "disabled"], hint: "Admin calls only; off for Portugal callers" },
  // Portugal HR callers
  { key: "PT_CALLERS_ENABLED", group: "pt", label: "Portugal callers enabled", kind: "bool", hint: "Off = demo data, no Apollo, no dial" },
  { key: "PT_CALLERS_LEGAL_APPROVED", group: "pt", label: "Written legal approval on file", kind: "bool", hint: "Required together with the switch above" },
  { key: "APOLLO_WEBHOOK_BASE_URL", group: "pt", label: "Apollo webhook base URL", kind: "text", hint: "https://<this shop>; phone results arrive at /api/apollo/webhook/…" },
  { key: "PT_CALLERS_APOLLO_RESULT_MODE", group: "pt", label: "Apollo phone results", kind: "select", options: ["webhook", "poll"], hint: "Never both" },
  { key: "APOLLO_DAILY_CREDIT_CAP", group: "pt", label: "Apollo credit cap per day", kind: "int", hint: "Empty = no cap" },
  { key: "APOLLO_MONTHLY_CREDIT_CAP", group: "pt", label: "Apollo credit cap per month", kind: "int", hint: "Empty = no cap" },
  { key: "PT_CALLERS_CALL_HOURS", group: "pt", label: "Calling hours (Lisbon)", kind: "text", hint: "e.g. 09:30-18:00; empty = no dial" },
  { key: "PT_CALLERS_CALL_DAYS", group: "pt", label: "Calling days", kind: "text", hint: "ISO weekdays, e.g. 1-5 (Monday to Friday)" },
  { key: "PT_CALLERS_DAILY_CALL_CAP", group: "pt", label: "Calls per day (all reps)", kind: "int", hint: "Empty = no dial" },
  { key: "PT_CALLERS_PILOT_NUMBERS", group: "pt", label: "Pilot numbers", kind: "text", hint: "Comma-separated test numbers; while the pilot runs only these are dialed" },
  { key: "PT_CALLERS_PILOT_COMPLETE", group: "pt", label: "Pilot complete", kind: "bool", hint: "Ticked = any approved lead can be dialed" },
  { key: "PT_CALLERS_LEGAL_BASIS_REQUIRED", group: "pt", label: "Require a legal basis per lead", kind: "bool", default: "true", hint: "On (default): an admin records the legal basis on each lead before it can be called. Off: the field is hidden and a business line is enough." },
  { key: "PT_CALLERS_DNC_REQUIRED", group: "pt", label: "Require the national do-not-call check", kind: "bool", default: "true", hint: "On (default): no dial until a do-not-call source is connected. Off: dial without it (a number a connected source reports as listed is still refused)." },
] as const;

export type OutboundKey = (typeof OUTBOUND_FIELDS)[number]["key"];
const KEYS = new Set<string>(OUTBOUND_FIELDS.map((f) => f.key));
const SETTINGS_KEY = "outbound_calls";

let cache: Record<string, string> = {};
let loadedAt = 0;

/** process.env with the saved Outbound-calls settings on top (only the whitelisted, non-secret keys). */
export function outboundEnv(): Record<string, string | undefined> {
  return { ...process.env, ...cache };
}

/** The saved values only (for the settings screen). */
export const savedOutbound = () => ({ ...cache });

function clean(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (KEYS.has(k) && typeof x === "string" && x.trim() !== "") out[k] = x.trim();
  return out;
}

/** Refreshes the in-process copy (at most every 15 s unless forced). A failed read keeps the last values. */
export async function loadOutboundSettings(force = false) {
  if (!force && Date.now() - loadedAt < 15_000) return;
  try {
    const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY)).limit(1);
    cache = clean(r?.value);
    loadedAt = Date.now();
  } catch (e) {
    console.error("[outbound-settings] load", e);
  }
}

/** Validates and stores the form; returns an error message or null. Empty fields fall back to Railway. */
export function validateOutbound(input: Record<string, string>): { values: Record<string, string>; error: string | null } {
  const values: Record<string, string> = {};
  for (const f of OUTBOUND_FIELDS) {
    const v = (input[f.key] ?? "").trim();
    if (f.kind === "bool") values[f.key] = v === "true" ? "true" : "false";
    else if (f.kind === "bool01") values[f.key] = v === "1" ? "1" : "0";
    else if (v === "") continue;
    else if (f.kind === "int") {
      if (!/^\d{1,7}$/.test(v)) return { values, error: `${f.label}: enter a whole number (or leave empty).` };
      values[f.key] = v;
    } else if (f.kind === "select") {
      if (!(f.options as readonly string[]).includes(v)) return { values, error: `${f.label}: choose one of ${f.options.join(", ")}.` };
      values[f.key] = v;
    } else values[f.key] = v.slice(0, 2000);
  }
  const e = (k: string, ok: (v: string) => boolean, msg: string) => (values[k] !== undefined && !ok(values[k]) ? msg : null);
  const error =
    e("TELNYX_FROM_NUMBER", (v) => /^\+\d{7,15}$/.test(v), "Caller ID must be E.164, e.g. +351210000000.") ??
    e("APOLLO_WEBHOOK_BASE_URL", (v) => /^https:\/\/[^/\s]+/.test(v), "Apollo webhook base URL must start with https://.") ??
    e("PT_CALLERS_CALL_HOURS", (v) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v), "Calling hours look like 09:30-18:00.") ??
    e("PT_CALLERS_CALL_DAYS", (v) => /^[1-7]-[1-7]$/.test(v), "Calling days look like 1-5.") ??
    e("PT_CALLERS_PILOT_NUMBERS", (v) => v.split(",").every((n) => /^\+\d{7,15}$/.test(n.trim())), "Pilot numbers: E.164, comma-separated.");
  return { values, error };
}

export async function saveOutbound(values: Record<string, string>) {
  await db.insert(schema.settings).values({ key: SETTINGS_KEY, value: values }).onConflictDoUpdate({ target: schema.settings.key, set: { value: values } });
  await loadOutboundSettings(true);
}
