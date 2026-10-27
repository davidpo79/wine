import { Footer, Header, WhatsAppIcon } from "@/components/landing/Chrome";
import { homeHref, legalHref } from "@/lib/i18n/paths";
import { LOCALE_INFO, type Locale } from "@/lib/markets";
import { ABOUT_COPY } from "./copy";
import { SITE } from "@/lib/site";

export function AboutPage({ locale }: { locale: Locale }) {
  const c = ABOUT_COPY[locale];
  return (
    <>
      <Header locale={locale} />
      <main className="paper-grain" lang={LOCALE_INFO[locale].htmlLang}>
        <article className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-ink [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-night [&_p]:mt-3">
          <h1 className="font-serif text-4xl font-semibold text-night">{c.title}</h1>
          <p className="text-lg">{c.lead}</p>

          <h2>{c.winesH}</h2>
          <img src="/lp/table-768.webp" alt={c.winesAlt} width={768} height={658} className="mt-4 w-full rounded-lg object-cover" style={{ aspectRatio: "3 / 2" }} loading="lazy" />
          <p>{c.wines}</p>

          <h2>{c.boxH}</h2>
          <img src="/lp/giftbox-768.webp" alt={c.boxAlt} width={767} height={638} className="mt-4 w-full rounded-lg object-cover" style={{ aspectRatio: "3 / 2" }} loading="lazy" />
          <p>{c.box}</p>

          <h2>{c.promiseH}</h2>
          <ul className="mt-3 space-y-2">
            {c.promise.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="font-bold text-[#184b36]" aria-hidden="true">✓</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <p>
            <a href={legalHref("shipping", locale)} className="underline underline-offset-2">{c.shippingLink}</a>
          </p>

          <h2>{c.companyH}</h2>
          <p>{c.company}</p>
          <p className="mt-2">
            {SITE.legalName}
            <br />
            {c.vat} {SITE.nif}
            <br />
            {SITE.address}
            <br />
            <a href={`mailto:${SITE.email}`} className="underline underline-offset-2">{SITE.email}</a>
            <br />
            <a href={SITE.whatsappLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 underline underline-offset-2">
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
              WhatsApp {SITE.whatsapp}
            </a>
            <br />
            <a href={SITE.instagram} target="_blank" rel="noopener" className="underline underline-offset-2">Instagram @wineportugalofficial</a>
          </p>

          <p className="mt-10">
            <a href={homeHref(locale)} className="inline-block rounded bg-[#a72d39] px-6 py-3 font-bold text-white no-underline">{c.cta}</a>
          </p>
        </article>
      </main>
      <Footer locale={locale} />
    </>
  );
}
