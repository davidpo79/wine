// Portugal HR callers: every switch and limit, parsed in one pure place from
// an env object the caller passes (so tests can hand it anything).
//
// THE LEGAL GATE (spec section 8, NO-GO before production). Calling Portugal
// is not cleared until a Portuguese lawyer approves it in writing. Two flags,
// both OFF unless set to the exact token "true":
//   PT_CALLERS_ENABLED         the module may use real data and real calls
//   PT_CALLERS_LEGAL_APPROVED  David records that the written approval exists
// Only both together are "live". Otherwise: demo data, the mock Apollo client,
// no real import, no real enrichment, no dial, and a banner.
//
// EVERY LIMIT FAILS CLOSED. Unset uses the documented default; set but
// malformed is zero (or "not configured"), never the default. Where the spec
// says a value must be approved before use (calling hours, the overall
// spending cap), unset means "not approved yet" and refuses.
import { normalizePtPhone, isDialablePtE164 } from "./phone";
import { parseCallingHours, type CallingHours } from "./hours";

export const DEFAULT_DAILY_CREDIT_CAP = 300;
export const DEFAULT_MONTHLY_CREDIT_CAP = 4000;
export const DEFAULT_REP_DAILY_CALL_CAP = 80;
export const DEFAULT_MAX_ATTEMPTS_PER_LEAD = 3;

export type Env = Record<string, string | undefined>;

export type PtFlags = {
  enabled: boolean;
  legalApproved: boolean;
  live: boolean;
  caps: { daily: number; monthly: number; valid: boolean };
  repDailyCallCap: number;
  /** Calls per day across all reps. 0 = no spending cap approved = no dial. */
  globalDailyCallCap: number;
  maxAttemptsPerLead: number;
  callingHours: CallingHours | null;
  pilotOnly: boolean;
  pilotNumbers: string[];
  apolloKeyPresent: boolean;
  enrichDelivery: "webhook" | "poll";
  webhookBaseUrl: string | null;
  configError: string | null;
};

const on = (v: string | undefined) => v === "true";

function parseCap(raw: string | undefined, dflt: number, min: number): { value: number; valid: boolean } {
  if (raw === undefined || raw === "") return { value: dflt, valid: true };
  if (!/^\d+$/.test(raw)) return { value: 0, valid: false };
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) return { value: 0, valid: false };
  return { value: n, valid: true };
}

export function readFlags(env: Env): PtFlags {
  const enabled = on(env.PT_CALLERS_ENABLED);
  const legalApproved = on(env.PT_CALLERS_LEGAL_APPROVED);
  const daily = parseCap(env.APOLLO_DAILY_CREDIT_CAP, DEFAULT_DAILY_CREDIT_CAP, 1);
  const monthly = parseCap(env.APOLLO_MONTHLY_CREDIT_CAP, DEFAULT_MONTHLY_CREDIT_CAP, 1);
  const repCalls = parseCap(env.PT_CALLERS_REP_DAILY_CALL_CAP, DEFAULT_REP_DAILY_CALL_CAP, 0);
  const globalCalls = parseCap(env.PT_CALLERS_DAILY_CALL_CAP, 0, 0);
  const attempts = parseCap(env.PT_CALLERS_MAX_ATTEMPTS_PER_LEAD, DEFAULT_MAX_ATTEMPTS_PER_LEAD, 0);

  // Spec section 7: webhook by default, polling only when chosen explicitly,
  // never both. A webhook without a public HTTPS base is a configuration error
  // that refuses enrichment; it never silently falls back to polling.
  let configError: string | null = null;
  const delivery = (env.APOLLO_ENRICH_DELIVERY ?? "").trim();
  let enrichDelivery: "webhook" | "poll" = "webhook";
  if (delivery === "poll") enrichDelivery = "poll";
  else if (delivery !== "" && delivery !== "webhook") configError = "apollo_enrich_delivery_invalid";
  let webhookBaseUrl: string | null = null;
  const base = (env.APOLLO_WEBHOOK_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (base) {
    if (/^https:\/\/[^\s/]+/.test(base)) webhookBaseUrl = base;
    else configError = configError ?? "apollo_webhook_base_not_https";
  }
  if (enrichDelivery === "webhook" && !webhookBaseUrl) configError = configError ?? "apollo_webhook_not_configured";

  const pilotNumbers = (env.PT_CALLERS_PILOT_NUMBERS ?? "")
    .split(",")
    .map((s) => normalizePtPhone(s))
    .filter((p): p is string => isDialablePtE164(p));

  return {
    enabled,
    legalApproved,
    live: enabled && legalApproved,
    caps: { daily: daily.value, monthly: monthly.value, valid: daily.valid && monthly.valid },
    repDailyCallCap: repCalls.value,
    globalDailyCallCap: globalCalls.value,
    maxAttemptsPerLead: attempts.value,
    callingHours: parseCallingHours(env.PT_CALLERS_CALLING_HOURS),
    // Spec section 11: a pilot only with test numbers whose ownership and
    // consent are confirmed. On unless set to exactly "false".
    pilotOnly: env.PT_CALLERS_PILOT_ONLY !== "false",
    pilotNumbers,
    apolloKeyPresent: Boolean((env.APOLLO_API_KEY ?? "").trim()),
    enrichDelivery,
    webhookBaseUrl,
    configError,
  };
}
