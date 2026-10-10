import { createHmac } from "node:crypto";

function secret() {
  return process.env.SESSION_SECRET ?? "dev";
}

export function unsubscribeToken(email: string) {
  return createHmac("sha256", secret()).update(`unsub:${email.toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function unsubscribeUrl(siteUrl: string, email: string) {
  return `${siteUrl}/api/leads/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

export function hashIp(ip: string | null) {
  return ip ? createHmac("sha256", secret()).update(`ip:${ip}`).digest("hex").slice(0, 24) : null;
}

export const LEAD_CONSENT_TEXT =
  "Aceito receber da Wine Portugal, por email, o código de desconto e lembretes sobre a oferta de Natal. Posso cancelar a qualquer momento.";

/** Token returned after step 1 so only that visitor can add a phone number to the lead. */
export function leadToken(email: string) {
  return createHmac("sha256", secret()).update(`lead:${email.toLowerCase()}`).digest("base64url").slice(0, 32);
}

/** Portuguese mobile numbers (91/92/93/96), with or without +351/00351. Returns +3519XXXXXXXX or null. */
export function normalizePtMobile(input: string): string | null {
  let d = input.replace(/[\s().-]/g, "");
  if (d.startsWith("+351")) d = d.slice(4);
  else if (d.startsWith("00351")) d = d.slice(5);
  return /^9[1236]\d{7}$/.test(d) ? `+351${d}` : null;
}

/** Any phone in international form: Portuguese mobiles as +3519XXXXXXXX, others as +<country><number> (8-15 digits). */
export function normalizePhone(input: string): string | null {
  const pt = normalizePtMobile(input);
  if (pt) return pt;
  let d = input.replace(/[\s().-]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

export const PHONE_CONSENT_TEXT =
  "Aceito ser contactado/a pela Wine Portugal por telefone ou WhatsApp sobre esta oferta de Natal. Posso cancelar a qualquer momento.";
