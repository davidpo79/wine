import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { boxesOffer, productOffers } from "@/lib/upsell";
import { UpsellFlow } from "@/components/checkout/UpsellFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Oferta especial · Wine Portugal", robots: { index: false, follow: false } };

export default async function Oferta({ searchParams }: { searchParams: Promise<{ o?: string; t?: string }> }) {
  const { o, t } = await searchParams;
  const order = await loadDraft(o ?? null, t ?? null);
  if (!order || !o || !t) redirect("/");
  const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`;
  if (!["paid", "preparing"].includes(order.status)) redirect(`/obrigado?${q}`);
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  if (!settings.upsell_enabled || !catalog) redirect(`/obrigado?${q}`);
  const paidAddons = await db.select({ sku: schema.orderAddons.sku }).from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "paid")));
  const taken = new Set(paidAddons.map((a) => a.sku));
  const first = boxesOffer(order, catalog.bundles);
  const others = productOffers(settings).filter((p) => !taken.has(p.sku));
  return (
    <UpsellFlow
      orderId={order.id}
      token={t}
      firstName={(order.customerName ?? "").split(" ")[0]}
      boxes={order.qtyBoxes}
      first={first && !taken.has(first.sku) ? first : null}
      others={others}
      oneClick={!!(order.stripePaymentMethodId && order.stripeCustomerId)}
      publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null}
    />
  );
}
