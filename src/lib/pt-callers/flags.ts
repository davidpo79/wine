// Portugal callers: every switch and limit, read from the environment on each call (server-only).
// A switch is on only when set to exactly "true". Anything unclear refuses.

import { outboundEnv } from "../outbound-settings";

type Env = Record<string, string | undefined>;

export { STATUSES, REP_OUTCOMES, DIALABLE, FINAL_BLOCKED, type LeadStatus } from "./statuses";

export function ptFlags(env: Env = outboundEnv()) {
  const enabled = env.PT_CALLERS_ENABLED === "true";
  const legalApproved = env.PT_CALLERS_LEGAL_APPROVED === "true";
  return { enabled, legalApproved, live: enabled && legalApproved };
}

/** Optional Apollo credit caps: unset (or empty) = no cap; a malformed value = 0, which spends nothing. */
export function creditCaps(env: Env = outboundEnv()) {
  const one = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  return { daily: one(env.APOLLO_DAILY_CREDIT_CAP), monthly: one(env.APOLLO_MONTHLY_CREDIT_CAP) };
}

/**
 * Approved calling hours, Lisbon time: PT_CALLERS_CALL_HOURS="09:30-18:00", days PT_CALLERS_CALL_DAYS="1-5"
 * (ISO weekdays, default Monday to Friday). Unset or malformed = no approved hours = no dial.
 */
export function inCallHours(env: Env = outboundEnv(), now = new Date()) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(env.PT_CALLERS_CALL_HOURS ?? "");
  if (!m) return false;
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  if (from >= to || to > 24 * 60) return false;
  const d = /^([1-7])-([1-7])$/.exec(env.PT_CALLERS_CALL_DAYS ?? "1-5");
  if (!d) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const min = Number(get("hour")) * 60 + Number(get("minute"));
  return day >= Number(d[1]) && day <= Number(d[2]) && min >= from && min < to;
}

/** Calls per day across all reps. Unset = 0 = no dial until a spend cap is approved. */
export function dailyCallCap(env: Env = outboundEnv()) {
  const n = Number(env.PT_CALLERS_DAILY_CALL_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Pilot: only numbers whose owner agreed to be called in a test may be dialed, until PT_CALLERS_PILOT_COMPLETE="true".
 * Returns null when the pilot is over (no restriction).
 */
export function pilotNumbers(env: Env = outboundEnv()): string[] | null {
  if (env.PT_CALLERS_PILOT_COMPLETE === "true") return null;
  return (env.PT_CALLERS_PILOT_NUMBERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** How Apollo delivers phone results: webhook (default) or polling, never both. */
export const resultMode = (env: Env = outboundEnv()): "webhook" | "poll" => (env.PT_CALLERS_APOLLO_RESULT_MODE === "poll" ? "poll" : "webhook");

/** National do-not-call check required before a dial: on unless explicitly "false". */
export const dncRequired = (env: Env = outboundEnv()) => env.PT_CALLERS_DNC_REQUIRED !== "false";

/** A recorded legal basis per lead before a dial: on unless explicitly "false". */
export const legalBasisRequired = (env: Env = outboundEnv()) => env.PT_CALLERS_LEGAL_BASIS_REQUIRED !== "false";

export const LOCK_MINUTES = 15;
export const RETENTION_DAYS = 90;
export const ENRICH_TIMEOUT_MINUTES = 30;
