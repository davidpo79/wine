import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/rich";
import { homeHref, legalHref } from "@/lib/i18n/paths";
import { COUNTRIES_FOR_LOCALE, type Locale } from "@/lib/markets";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}

export function Marquee({ items }: { items: string[] }) {
  const row = (aria: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={!aria}>
      {items.map((t, i) => (
        <li key={i} className="flex items-center whitespace-nowrap px-4">
          <span className="mr-4 text-gold" aria-hidden="true">✦</span>
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="overflow-hidden bg-xmas py-2 text-[13px] font-medium tracking-wide text-white" role="region" aria-label="Avisos">
      <div className="flex w-max animate-marquee">
        {row(true)}
        {row(false)}
        {row(false)}
        {row(false)}
      </div>
    </div>
  );
}

export function Header({ locale = "pt" }: { locale?: Locale }) {
  const t = getDict(locale).chrome;
  return (
    <header className="border-b border-paper-2 bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href={homeHref(locale)} className="leading-none text-night" aria-label={t.homeLabel}>
          <img src="/brand/logo.svg" alt="Wine Portugal" width={961} height={390} className="h-9 w-auto" />
        </a>
        <div className="flex items-center gap-2">
        <a href={SITE.phoneLink} className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-night hover:underline">
          📞 {SITE.whatsapp}
        </a>
        <a
          href={SITE.whatsappLink}
          target="_blank"
          rel="noopener"
          aria-label={t.questions}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-night/15 px-3 text-sm font-medium text-night hover:bg-white"
        >
          <WhatsAppIcon className="h-5 w-5 text-[#1f8f4e]" />
          <span className="hidden sm:inline">{t.questions}</span>
        </a>
        </div>
      </div>
    </header>
  );
}

const METHODS = ["MB WAY", "Multibanco", "Visa", "Mastercard", "Apple Pay", "Google Pay"];

export function PaymentBadges() {
  return (
    <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Métodos de pagamento aceites">
      {METHODS.map((m) => (
        <li key={m} className="rounded border border-night/15 bg-white px-2 py-1 text-[11px] font-semibold tracking-wide text-night">
          {m}
        </li>
      ))}
    </ul>
  );
}

export function Footer({ locale = "pt" }: { locale?: Locale }) {
  const d = getDict(locale);
  const t = d.chrome;
  return (
    <footer className="bg-night pb-24 text-paper/80 lg:pb-0">
      <div className="azulejo-strip opacity-80" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-3">
        <div>
          <img src="/brand/logo-light.svg" alt="Wine Portugal" width={961} height={390} className="h-9 w-auto" />
          <p className="mt-2">{SITE.legalName}</p>
          <p>NIF {SITE.nif}</p>
          <p>{SITE.address}</p>
        </div>
        <div>
          <p className="font-semibold text-paper">{t.contacts}</p>
          <p className="mt-2">
            <a href={`mailto:${SITE.email}`} className="inline-block py-1.5 hover:text-gold">{SITE.email}</a>
          </p>
          <p>
            <a href={SITE.whatsappLink} target="_blank" rel="noopener" className="inline-block py-1.5 hover:text-gold">WhatsApp {SITE.whatsapp}</a>
          </p>
          <p>
            <a href={SITE.instagram} target="_blank" rel="noopener" className="inline-block py-1.5 hover:text-gold">Instagram @wineportugalofficial</a>
          </p>
        </div>
        <div>
          <p className="font-semibold text-paper">{t.legalInfo}</p>
          <ul className="mt-1">
            <li><a href={legalHref("terms", locale)} className="inline-block py-1.5 hover:text-gold">{d.common.legal.terms}</a></li>
            <li><a href={legalHref("privacy", locale)} className="inline-block py-1.5 hover:text-gold">{d.common.legal.privacy}</a></li>
            <li><a href={legalHref("shipping", locale)} className="inline-block py-1.5 hover:text-gold">{d.common.legal.shipping}</a></li>
            {COUNTRIES_FOR_LOCALE[locale].includes("PT") && (
              <li>
                <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener" className="inline-block py-1.5 hover:text-gold">{t.complaintsOnline}</a>
              </li>
            )}
            <li><OpenConsentLink className="inline-block py-1.5 hover:text-gold" locale={locale} /></li>
          </ul>
          <p className="mt-3 text-xs">
            {fmt(t.ral, { entity: SITE.ralEntity })}{" "}
            <a href="https://www.consumidor.gov.pt" target="_blank" rel="noopener" className="underline">consumidor.gov.pt</a>.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs">
          <p className="font-semibold text-gold">{t.responsible}</p>
          <p className="mt-1">{t.minors}</p>
          <p className="mt-2 text-paper/70">{t.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
