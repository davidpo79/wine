import Stripe from "stripe";

let stripe: Stripe | null = null;
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripe) {
    // STRIPE_API_BASE points the SDK at a local stand-in in tests (scripts/mock-ifthenpay.ts also mocks Stripe).
    const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      appInfo: { name: "vinho-prendadenatal" },
      ...(base ? { host: base.hostname, port: Number(base.port), protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
    });
  }
  return stripe;
}

export function stripeMode(): "test" | "live" | "unset" {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (k.startsWith("sk_live") || k.startsWith("rk_live")) return "live";
  if (k.startsWith("sk_test") || k.startsWith("rk_test")) return "test";
  return "unset";
}

/** Cards + Apple Pay / Google Pay go through Stripe when both keys are set (saved card = one-click upsell). */
export function stripeConfigured() {
  return Boolean(process.env["STRIPE_SECRET_KEY"] && process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
}

/** Read at request time (bracket access is not inlined at build), so a key change needs no rebuild. */
export function stripePublishableKey(): string | null {
  return stripeConfigured() ? (process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ?? null) : null;
}

/**
 * Apple Pay (and Google Pay) on the web only show on domains registered in Stripe (Payment method domains). Apple
 * verifies the domain with the file public/.well-known/apple-developer-merchantid-domain-association (Stripe's own).
 * Run at server start: registers the site's domain if missing, re-validates it while Apple Pay is not active.
 */
export async function ensurePaymentMethodDomain() {
  if (!stripeConfigured() || stripeMode() === "unset" || process.env.STRIPE_API_BASE) return;
  const host = new URL(process.env.SITE_URL ?? "http://localhost").hostname;
  if (!host || host === "localhost") return;
  const s = getStripe();
  const found = await s.paymentMethodDomains.list({ domain_name: host, limit: 1 });
  let d = found.data[0] ?? (await s.paymentMethodDomains.create({ domain_name: host, enabled: true }));
  if (!d.enabled) d = await s.paymentMethodDomains.update(d.id, { enabled: true });
  if (d.apple_pay.status !== "active") d = await s.paymentMethodDomains.validate(d.id);
  console.log(
    `[stripe] payment method domain ${host}: apple_pay=${d.apple_pay.status}${d.apple_pay.status_details?.error_message ? ` (${d.apple_pay.status_details.error_message})` : ""} google_pay=${d.google_pay.status}`,
  );
}
