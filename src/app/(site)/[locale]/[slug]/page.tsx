import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { getDict } from "@/lib/i18n";
import { ABOUT_SLUGS, legalKindFromSlug } from "@/lib/i18n/paths";
import { AboutPage } from "@/components/about/AboutPage";
import { ABOUT_COPY } from "@/components/about/copy";
import { isLocale } from "@/lib/markets";
import { LEGAL_CONTENT, LEGAL_UPDATED } from "@/components/legal/content";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || locale === "pt") return {};
  if (slug === ABOUT_SLUGS[locale]) return { title: `${ABOUT_COPY[locale].title} | Wine Portugal` };
  const kind = legalKindFromSlug(locale, slug);
  return kind ? { title: `${getDict(locale).legalPage.titles[kind]} | Wine Portugal` } : {};
}

/** Legal pages in German, Dutch, French and Russian (Portuguese keeps /termos, /privacidade, /envios-devolucoes). */
export default async function LocalizedLegal({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || locale === "pt") notFound();
  if (slug === ABOUT_SLUGS[locale]) return <AboutPage locale={locale} />;
  const kind = legalKindFromSlug(locale, slug);
  const content = kind ? LEGAL_CONTENT[locale]?.[kind] : null;
  if (!kind || !content) notFound();
  const Body = content;
  return (
    <LegalPage title={getDict(locale).legalPage.titles[kind]} updated={LEGAL_UPDATED[locale] ?? "[[TODO]]"} locale={locale}>
      <Body />
      {/* Licence credit for the IP-to-country database that picks the shop language (CC BY 4.0). */}
      {kind === "privacy" && (
        <p className="text-xs text-muted">
          <a href="https://db-ip.com" className="underline">IP Geolocation by DB-IP</a> (CC BY 4.0)
        </p>
      )}
    </LegalPage>
  );
}
