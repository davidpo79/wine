// Portugal HR callers: Portuguese phone numbers. Pure.
// Dialable = E.164 +351 then nine digits starting 2 (fixed), 3 (nomadic) or 9
// (mobile). 7xx (premium) and 8xx (toll-free, shared cost) are refused.

const DIALABLE = /^\+351[239]\d{8}$/;

export function normalizePtPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+")) return /^\+\d{7,15}$/.test(digits) ? digits : null;
  if (/^\d{9}$/.test(digits)) return "+351" + digits;
  if (/^351\d{9}$/.test(digits)) return "+" + digits;
  return null;
}

export function isDialablePtE164(v: unknown): v is string {
  return typeof v === "string" && DIALABLE.test(v);
}

/** What a rep sees: the country code, the first digit and the last two. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (typeof e164 !== "string" || !e164) return null;
  const m = e164.match(/^\+351(\d)(\d{8})$/);
  if (!m) return "•••";
  return `+351 ${m[1]}•• ••• •${m[2].slice(-2)}`;
}
