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
