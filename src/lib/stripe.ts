import Stripe from "stripe";

let stripe: Stripe | null = null;
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: "vinho-prendadenatal" } });
  return stripe;
}

export function stripeMode(): "test" | "live" | "unset" {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (k.startsWith("sk_live") || k.startsWith("rk_live")) return "live";
  if (k.startsWith("sk_test") || k.startsWith("rk_test")) return "test";
  return "unset";
}

export type MultibancoInfo = { entity?: string | null; reference?: string | null; expires_at?: number | null; hosted_voucher_url?: string | null };

