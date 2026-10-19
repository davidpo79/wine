// Portuguese numbers: normalize to +351, the dialable check, masking for reps, and the hashed block key.
import { createHash } from "node:crypto";

/** +351 followed by 9 digits starting 2 (landline), 3 (nomadic) or 9 (mobile); null for anything else. */
export function normalizePtPhone(input: string | null | undefined): string | null {
  let d = String(input ?? "").replace(/[\s().-]/g, "");
  if (d.startsWith("+351")) d = d.slice(4);
  else if (d.startsWith("00351")) d = d.slice(5);
  else if (d.startsWith("+") || d.startsWith("00")) return null;
  return /^[239]\d{8}$/.test(d) ? `+351${d}` : null;
}

export const isDialablePt = (e164: string | null | undefined) => /^\+351[239]\d{8}$/.test(String(e164 ?? ""));

/** "+351 9•• ••• •78": enough to recognize the line, not to dial it elsewhere. */
export function maskPhone(e164: string | null | undefined) {
  const v = String(e164 ?? "");
  if (!/^\+351\d{9}$/.test(v)) return v ? "•••" : "";
  return `+351 ${v[4]}•• ••• •${v.slice(-2)}`;
}

/** Block-list key: sha256 of kind + normalized value. The raw identifier is never stored in the block list. */
export function blockHash(kind: "phone" | "apollo_id", value: string) {
  const v = kind === "phone" ? (normalizePtPhone(value) ?? value.replace(/\s/g, "")) : value.trim();
  return createHash("sha256").update(`${kind}:${v}`).digest("hex");
}
