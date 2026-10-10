import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout · Trilogia 2160 | Wine Portugal", robots: { index: false, follow: false } };

export default async function Checkout() {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, label: b.label, qty: b.qty, priceCents: b.priceCents, compareAtCents: b.compareAtCents, shippingCents: b.shippingCents }));
  const cutoffLabel = new Date(settings.cutoff_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" });
  return <CheckoutPage bundles={bundles} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null} reviews={settings.reviews ?? []} cutoffLabel={cutoffLabel} />;
}
