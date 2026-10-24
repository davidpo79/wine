import { Footer, Header } from "@/components/landing/Chrome";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/rich";
import { LOCALE_INFO, type Locale } from "@/lib/markets";

export function LegalPage({ title, updated, locale = "pt", children }: { title: string; updated: string; locale?: Locale; children: React.ReactNode }) {
  const t = getDict(locale).legalPage;
  return (
    <>
      <Header locale={locale} />
      <main className="paper-grain" lang={LOCALE_INFO[locale].htmlLang}>
        <article className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-ink [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-night [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-1">
          <h1 className="font-serif text-4xl font-semibold text-night">{title}</h1>
          <p className="text-sm text-muted">{fmt(t.updated, { date: updated })}</p>
          {children}
        </article>
      </main>
      <Footer locale={locale} />
    </>
  );
}
