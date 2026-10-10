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
