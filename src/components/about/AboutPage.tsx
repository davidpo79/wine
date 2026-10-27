import { Footer, Header, WhatsAppIcon } from "@/components/landing/Chrome";
import { homeHref, legalHref } from "@/lib/i18n/paths";
import { LOCALE_INFO, type Locale } from "@/lib/markets";
import { ABOUT_COPY } from "./copy";
import { SITE } from "@/lib/site";

const Icon = {
  vine: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
      <path d="M12 3c0 2 1 3 3 3" />
      <circle cx="9" cy="10" r="2.2" /><circle cx="14" cy="10" r="2.2" /><circle cx="11.5" cy="14" r="2.2" /><circle cx="6.5" cy="13.5" r="2.2" /><circle cx="9" cy="18" r="2.2" />
    </svg>
  ),
  bottle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
      <path d="M10 2h4v4.5c0 1 2.5 2.2 2.5 5.5v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9c0-3.3 2.5-4.5 2.5-5.5z" /><path d="M7.5 13h9v5h-9z" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
      <path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
    </svg>
  ),
};

/** "The usual path" (every intermediary adds +€) next to "With us" (producer, us, your door). */
function PathCompare({ c }: { c: (typeof ABOUT_COPY)[Locale] }) {
  const icons = [Icon.vine, Icon.bottle, Icon.home];
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-paper-2 bg-white/70 p-5">
        <p className="!mt-0 text-xs font-bold uppercase tracking-[0.14em] text-muted">{c.tradLabel}</p>
        <ol className="relative mt-4 space-y-2.5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:border-l before:border-dashed before:border-paper-2">
          {c.trad.map((s, i) => {
            const middle = i > 0 && i < c.trad.length - 1;
            return (
              <li key={s} className="relative flex items-center gap-3 text-sm">
                <span className={`relative z-10 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${middle ? "border-paper-2 bg-white" : "border-muted bg-muted"}`} />
                <span className={middle ? "text-muted" : "font-semibold text-ink"}>{s}</span>
                {middle && <span className="ml-auto rounded-full bg-[#f6e3e5] px-2 py-0.5 text-[11px] font-bold text-[#a72d39]">+€</span>}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-night p-5 text-white shadow-[0_10px_30px_-12px_rgba(16,45,33,0.6)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/15" aria-hidden="true" />
        <p className="!mt-0 text-xs font-bold uppercase tracking-[0.14em] text-gold">{c.oursLabel}</p>
        <ol className="relative mt-5 space-y-6 before:absolute before:bottom-6 before:left-[23px] before:top-6 before:w-0.5 before:bg-gold/60">
          {c.ours.map((s, i) => (
            <li key={s} className="relative flex items-center gap-4">
              <span className={`relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full ${i === 1 ? "bg-gold text-night" : "bg-[#1f4233] text-gold ring-1 ring-gold/50"}`}>{icons[i]}</span>
              <span className={`font-serif text-xl ${i === 1 ? "font-bold" : "font-semibold"}`}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function AboutPage({ locale }: { locale: Locale }) {
  const c = ABOUT_COPY[locale];
  return (
    <>
      <Header locale={locale} />
      <main className="paper-grain" lang={LOCALE_INFO[locale].htmlLang}>
        <article className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-ink [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-night [&_p]:mt-3">
          <h1 className="font-serif text-4xl font-semibold text-night">{c.title}</h1>
          <p className="text-lg font-semibold text-night">{c.lead}</p>

          <h2>{c.whyH}</h2>
          {c.why.map((x) => (
            <p key={x}>{x}</p>
          ))}

          <h2>{c.howH}</h2>
          <p>{c.how}</p>
          <PathCompare c={c} />
          <p>{c.value}</p>
          <p>{c.logistics}</p>

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

          <p className="mt-10 font-serif text-xl font-semibold text-night">{c.closing}</p>
          <p className="mt-5">
            <a href={homeHref(locale)} className="inline-block rounded bg-[#a72d39] px-6 py-3 font-bold text-white no-underline">{c.cta}</a>
          </p>
        </article>
      </main>
      <Footer locale={locale} />
    </>
  );
}
