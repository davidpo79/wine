// Portugal callers: every switch and limit, read from the environment on each call (server-only).
// A switch is on only when set to exactly "true". Anything unclear refuses.

type Env = Record<string, string | undefined>;

export const STATUSES = [
  "new",
  "ready",
  "calling",
  "no_answer",
  "callback",
  "interested",
  "not_interested",
  "wrong_number",
  "opt_out",
  "blocked",
  "enrichment_pending",
  "failed",
] as const;
export type LeadStatus = (typeof STATUSES)[number];

/** Business outcomes a rep may set after a call. Opt-out has its own always-visible button. */
export const REP_OUTCOMES: LeadStatus[] = ["no_answer", "callback", "interested", "not_interested", "wrong_number"];
/** Statuses a lead can be dialed from. */
export const DIALABLE: LeadStatus[] = ["ready", "no_answer", "callback"];
/** Never leave these (opt-out and blocks are permanent). */
export const FINAL_BLOCKED: LeadStatus[] = ["opt_out", "blocked"];

export function ptFlags(env: Env = process.env) {
  const enabled = env.PT_CALLERS_ENABLED === "true";
  const legalApproved = env.PT_CALLERS_LEGAL_APPROVED === "true";
  return { enabled, legalApproved, live: enabled && legalApproved };
}

/** Optional Apollo credit caps: unset (or empty) = no cap; a malformed value = 0, which spends nothing. */
export function creditCaps(env: Env = process.env) {
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
export function inCallHours(env: Env = process.env, now = new Date()) {
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
export function dailyCallCap(env: Env = process.env) {
  const n = Number(env.PT_CALLERS_DAILY_CALL_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Pilot: only numbers whose owner agreed to be called in a test may be dialed, until PT_CALLERS_PILOT_COMPLETE="true".
 * Returns null when the pilot is over (no restriction).
 */
export function pilotNumbers(env: Env = process.env): string[] | null {
  if (env.PT_CALLERS_PILOT_COMPLETE === "true") return null;
  return (env.PT_CALLERS_PILOT_NUMBERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** How Apollo delivers phone results: webhook (default) or polling, never both. */
export const resultMode = (env: Env = process.env): "webhook" | "poll" => (env.PT_CALLERS_APOLLO_RESULT_MODE === "poll" ? "poll" : "webhook");

export const LOCK_MINUTES = 15;
export const RETENTION_DAYS = 90;
export const ENRICH_TIMEOUT_MINUTES = 30;
