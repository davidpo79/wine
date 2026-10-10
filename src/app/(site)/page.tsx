import type { Metadata } from "next";
import { getCatalog, paidBoxes, salesState } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { BuyProvider, type PublicBundle, type SalesMode } from "@/components/landing/BuyContext";
import { LandingPage } from "@/components/landing/LandingPage";
import "./landing.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trilogia 2160 | Acerte na prenda de Natal",
  description: "Três vinhos do Douro, caixa de Natal e guia digital de oferta. Poupe 10% em 2 caixas ou 15% em 3, com envio grátis.",
};

export default async function Home() {
  const [catalog, settings, sold] = await Promise.all([getCatalog(), getSettings(), paidBoxes()]);
  if (!catalog || catalog.bundles.length === 0) {
    return <main style={{ padding: 40, textAlign: "center" }}>Loja em preparação. Volte em breve.</main>;
  }
  const mode: SalesMode = salesState(settings, sold).mode;
  const bundles: PublicBundle[] = catalog.bundles.map((b) => ({
    key: b.key,
    label: b.label,
    qty: b.qty,
    priceCents: b.priceCents,
    compareAtCents: b.compareAtCents,
    shippingCents: b.shippingCents,
    badge: b.badge,
  }));
  const cutoffLabel = new Date(settings.cutoff_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" });
  const defaultKey = bundles.find((b) => b.qty === 2)?.key ?? bundles[0].key;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Trilogia 2160",
    description: catalog.product.shortDescription,
    brand: { "@type": "Brand", name: "2160 Onde Tudo Nasce" },
    category: "Vinho",
    image: [`${SITE.url}/lp/giftbox.webp`, `${SITE.url}/lp/table.webp`],
    offers: bundles.map((b) => ({
      "@type": "Offer",
      name: b.label,
      price: (b.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: mode === "open" || mode === "after_christmas" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: SITE.url,
    })),
  };

  return (
    <BuyProvider bundles={bundles} defaultKey={defaultKey} mode={mode} promoConfig={settings.lead_code && settings.lead_discount_percent > 0 ? { code: settings.lead_code, percent: settings.lead_discount_percent, maxQty: settings.lead_code_max_qty, plusCode: settings.lead_plus_code } : null}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LandingPage deliveryText={settings.delivery_text} cutoffLabel={cutoffLabel} cutoffIso={settings.cutoff_at} exitPopup={settings.exit_popup_enabled} />
    </BuyProvider>
  );
}
