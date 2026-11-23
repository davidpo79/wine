"use client";

import { ProducerVideo } from "@/components/landing/ProducerVideo";
import { useEffect, useMemo, useRef, useState } from "react";
import { newEventId, track } from "@/lib/track-client";
import { flushJourney, jlog } from "@/lib/journey-client";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/rich";
import { aboutHref, legalHref } from "@/lib/i18n/paths";
import { BF_OFFERS, bfHref, isBfLocale, type BfOfferId } from "@/lib/black-friday";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import type { BfCopy } from "./copy";
import { SITE } from "@/lib/site";
import { LivePill, LiveToasts } from "./LiveActivity";
import { Gallery } from "./Gallery";
import { BfSignup } from "./BfSignup";

const PAY_NAMES = { visa: "Visa", mastercard: "Mastercard", paypal: "PayPal", "apple-pay": "Apple Pay", "google-pay": "Google Pay" } as const;

export type BfBundle = { key: string; qty: number; priceCents: number; compareAtCents: number | null };

const pad = (n: number) => String(n).padStart(2, "0");

/** Big countdown to the order cutoff. Renders zeros before mount (no hydration mismatch); `onEnd` fires at zero. */
function Countdown({ cutoffIso, units, onEnd }: { cutoffIso: string; units: BfCopy["countdownUnits"]; onEnd: () => void }) {
  const cutoff = new Date(cutoffIso).getTime();
  const [now, setNow] = useState<number | null>(null);
  const ended = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = now === null ? 0 : Math.max(0, Math.floor((cutoff - now) / 1000));
  useEffect(() => {
    if (now !== null && s === 0 && !ended.current) {
      ended.current = true;
      onEnd();
    }
  }, [now, s, onEnd]);
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  return (
    <div className="bf-count" role="timer" aria-label={parts.map((v, i) => `${v} ${units[i]}`).join(", ")}>
      {parts.map((v, i) => (
        <div key={i} className="bf-unit" aria-hidden="true">
          <b>{now === null ? "--" : i === 0 ? v : pad(v)}</b>
          <small>{units[i]}</small>
        </div>
      ))}
    </div>
  );
}

// More real photos of an offer for the gallery (after the hero); the page's own story and pairing photos follow.
const GALLERY_EXTRA: Partial<Record<BfOfferId, string[]>> = {
  // poco-life-*: lifestyle photos made with Higgsfield from the real bottle and box photos (21/11/2026).
  poco: ["/lp/bf/poco-life-pour.webp", "/lp/bf/poco-hero.webp", "/lp/bf/poco-life-dinner.webp", "/lp/bf/poco-bottle.webp", "/lp/bf/poco-life-unbox.webp", "/lp/bf/poco-life-gift.webp"],
  pocoeu: ["/lp/bf/poco-life-pour.webp", "/lp/bf/poco-hero.webp", "/lp/bf/poco-life-dinner.webp", "/lp/bf/poco-bottle.webp", "/lp/bf/poco-life-unbox.webp", "/lp/bf/poco-life-gift.webp"],
  burbujas: ["/lp/bf/espumoso-bottle.webp"],
  sekt: ["/lp/bf/espumoso-bottle.webp"],
};

const PROMO_ON: Record<string, string> = {
  es: "✓ Código {code} aplicado: {amount} menos en tu pedido",
  pt: "✓ Código {code} aplicado: menos {amount} na sua encomenda",
  de: "✓ Code {code} aktiv: {amount} weniger auf Ihre Bestellung",
  nl: "✓ Code {code} actief: {amount} korting op je bestelling",
  fr: "✓ Code {code} appliqué : {amount} de moins sur votre commande",
  ru: "✓ Код {code} применён: скидка {amount} на заказ",
};

const PRODUCER: Record<string, string> = {
  es: "Directo del productor, Douro",
  pt: "Direto do produtor, Douro",
  de: "Direkt vom Erzeuger, Douro",
  nl: "Rechtstreeks van de producent, Douro",
  fr: "En direct du producteur, Douro",
  ru: "Напрямую от производителя, Дору",
};

// "All taxes included" in the trust icons (David, 23/11/2026).
const TAXES: Record<string, string> = {
  es: "Todos los impuestos incluidos",
  pt: "Todos os impostos incluídos",
  de: "Alle Steuern inklusive",
  nl: "Alle belastingen inbegrepen",
  fr: "Toutes taxes comprises",
  ru: "Все налоги включены",
  en: "All taxes included",
};

const ico = { width: 34, height: 34, viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const TRUST_ICONS = {
  receipt: (
    <svg {...ico}>
      <path d="M12 5h24v38l-4-3-4 3-4-3-4 3-4-3-4 3z" />
      <path d="M18 15h12M18 21h12" />
      <path d="M19 33l10-8" />
      <circle cx="19.5" cy="26.5" r="1.5" />
      <circle cx="28.5" cy="31.5" r="1.5" />
    </svg>
  ),
  truck: (
    <svg {...ico}>
      <path d="M4 12h24v20H4z" />
      <path d="M28 18h8l6 7v7h-14" />
      <circle cx="12" cy="35" r="4" />
      <circle cx="35" cy="35" r="4" />
      <path d="M8 18h10M8 23h7" />
    </svg>
  ),
  shield: (
    <svg {...ico}>
      <path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" />
      <path d="M17 24l5 5 9-10" />
    </svg>
  ),
  bottle: (
    <svg {...ico}>
      <path d="M20 4h8v8c4 2 6 6 6 10v20a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V22c0-4 2-8 6-10z" />
      <path d="M14 28h20" />
      <path d="M39 8a8 8 0 0 1 3 11M42 19l-4-1M39 8l-1 4" />
    </svg>
  ),
  grapes: (
    <svg {...ico}>
      <path d="M24 10c0-4 3-6 7-6" />
      <circle cx="18" cy="17" r="4" />
      <circle cx="28" cy="17" r="4" />
      <circle cx="23" cy="25" r="4" />
      <circle cx="13" cy="25" r="4" />
      <circle cx="33" cy="25" r="4" />
      <circle cx="18" cy="33" r="4" />
      <circle cx="28" cy="33" r="4" />
      <circle cx="23" cy="41" r="4" />
    </svg>
  ),
};

/** Four reasons to trust the shop as icons, under the price (like the checkout tiles): from the offer's own lines. */
function TrustIcons({ trust, locale, vars }: { trust: string[]; locale: string; vars: Record<string, string> }) {
  const part = (emoji: string, n = 1) => {
    const l = trust.find((x) => x.startsWith(emoji));
    return l ? fmt(l.replace(/^\S+\s*/u, ""), vars).split(" · ").slice(0, n).join(" · ") : null;
  };
  const items = [
    { icon: TRUST_ICONS.truck, text: part("🚚", 2) },
    { icon: TRUST_ICONS.shield, text: part("🔒") },
    { icon: TRUST_ICONS.grapes, text: PRODUCER[locale] ?? PRODUCER.es },
    { icon: TRUST_ICONS.bottle, text: part("↩️") },
    { icon: TRUST_ICONS.receipt, text: TAXES[locale] ?? TAXES.es },
  ].filter((x): x is { icon: React.JSX.Element; text: string } => !!x.text);
  if (items.length < 2) return null;
  return (
    <ul className="bf-trusticons">
      {items.map((x) => (
        <li key={x.text}>
          <span className="bf-trusticon">{x.icon}</span>
          <span>{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function BlackFridayPage({
  offer: offerId = "douro6",
  copy,
  bundles: bundlesIn,
  cutoffIso,
  cutoffLabel,
  deliveryDays,
  open: openAtLoad,
  leadAmountCents = 0,
  leadCode = "",
}: {
  offer?: BfOfferId;
  copy: BfCopy;
  bundles: BfBundle[];
  cutoffIso: string;
  cutoffLabel: string;
  deliveryDays: string;
  open: boolean;
  /** The exit popup's code value (Settings: bf_lead_amount_cents); 0 = no popup. */
  leadAmountCents?: number;
  /** The exit popup's code (Settings: bf_lead_code): once the visitor has it, the page shows the prices with it. */
  leadCode?: string;
}) {
  const { locale, country, money, moneyShort } = useI18n();
  const offer = BF_OFFERS[offerId];
  const perBoxBottles = offer.bottlesPerBox;
  const img = copy.images;
  // The About page opened from here shows this offer (its wine and photos), not the Douro box.
  const aboutFrom = offer.path ? `bf-${offer.path}` : "bf";
  // The popup code saved in this browser (popup, SMS or email link): every price on the page shows it taken off.
  const [promoOn, setPromoOn] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        setPromoOn(!!leadCode && leadAmountCents > 0 && (localStorage.getItem("wp_promo") ?? "").toUpperCase() === leadCode.toUpperCase());
      } catch {}
    };
    check();
    window.addEventListener("wp-promo", check);
    return () => window.removeEventListener("wp-promo", check);
  }, [leadCode, leadAmountCents]);
  const off = promoOn ? leadAmountCents : 0;
  const bundles = useMemo(() => (off ? bundlesIn.map((b) => ({ ...b, priceCents: Math.max(100, b.priceCents - off) })) : bundlesIn), [bundlesIn, off]);
  const listPrice = (k: string) => bundlesIn.find((b) => b.key === k)?.priceCents ?? 0;
  const [open, setOpen] = useState(openAtLoad);
  const [key, setKey] = useState(bundles.find((b) => b.qty === 2)?.key ?? bundles[0]?.key);
  const [going, setGoing] = useState(false);
  const selected = bundles.find((b) => b.key === key) ?? bundles[0];
  const selectedBundle = selected;
  const single = bundles.find((b) => b.qty === 1);
  const v = { date: cutoffLabel, days: deliveryDays };
  const gallery = [
    ...new Set(
      [img.hero, ...(GALLERY_EXTRA[offerId] ?? []), img.cutIsBox ? img.cut : null, ...copy.story.map((x) => x.img), ...copy.evening.map((x) => x.img ?? null), img.who ?? null].filter(
        (x): x is string => !!x && x.startsWith("/"),
      ),
    ),
  ].slice(0, 12);
  const t = (s: string) => fmt(s, v);

  useEffect(() => {
    if (selected) track("ViewContent", { content_ids: [offer.slug], content_type: "product", value: selected.priceCents / 100, currency: "EUR" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (k: string) => {
    if (k === key) return;
    setKey(k);
    const b = bundles.find((x) => x.key === k);
    if (b) track("SelectBundle", { bundle_key: b.key, value: b.priceCents / 100, currency: "EUR" });
    jlog("bundle_select", { bundle: k, where: `black_friday${offer.path ? `_${offer.path}` : ""}` });
  };

  // key: a bundle bought straight from a button (the 1-box button at the top); else the chosen bundle.
  const buy = (key?: string) => {
    const selected = (key && bundles.find((b) => b.key === key)) || selectedBundle;
    if (!selected || !open || going) return;
    setGoing(true);
    track("AddToCart", { content_ids: [offer.slug], content_type: "product", value: selected.priceCents / 100, currency: "EUR", num_items: selected.qty, bundle_key: selected.key }, newEventId("atc"));
    jlog("click", { label: "checkout_cta", bundle: selected.key, where: `black_friday${offer.path ? `_${offer.path}` : ""}` });
    flushJourney();
    location.assign(`/checkout?b=${encodeURIComponent(selected.key)}&l=${locale}&c=${country}`);
  };

  useEffect(() => {
    try {
      const pc = new URLSearchParams(location.search).get("promo");
      if (pc && /^[A-Za-z0-9-]{3,20}$/.test(pc)) {
        localStorage.setItem("wp_promo", pc.toUpperCase());
        window.dispatchEvent(new Event("wp-promo"));
      }
    } catch {}
  }, []);

  const hrefFor = useMemo(() => (l: string) => (isBfLocale(l) ? bfHref(l, offer) : `/${l}`), [offer]);
  const priceLabel = selected ? money(selected.priceCents) : "";

  const picker = (
    <div className="bf-bundles" role="radiogroup" aria-label={copy.cta.replace(" · {price}", "")}>
      {bundles.map((b) => {
        const info = copy.bundles[b.key] ?? { title: `${b.qty}×`, bottles: `${b.qty * perBoxBottles}` };
        const perBox = Math.round(b.priceCents / b.qty);
        const vsOne = single && b.qty > 1 ? listPrice(single.key) * b.qty - listPrice(b.key) : 0;
        return (
          <button key={b.key} type="button" role="radio" aria-checked={b.key === key} className="bf-bundle" data-qty={b.qty} onClick={() => choose(b.key)}>
            {info.badge ? <span className="bf-badge">{info.badge}</span> : <span className="bf-badge bf-badge-empty" aria-hidden="true" />}
            <span className={`bf-bimg${img.cutIsPhoto ? " bf-bimg-photo" : ""}${img.cutIsBox ? " bf-bimg-boxes" : ""}`} data-qty={Math.min(b.qty, 3)} aria-hidden="true">
              {Array.from({ length: Math.min(b.qty, 3) }, (_, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img.cut} alt="" loading="lazy" />
              ))}
            </span>
            <span className="bf-btitle">{info.title}</span>
            <span className="bf-bbottles">{info.bottles}</span>
            {b.compareAtCents && b.compareAtCents > b.priceCents ? (
              <span className="bf-was">
                {copy.usual} <s>{moneyShort(b.compareAtCents)}</s>
              </span>
            ) : (
              <span className="bf-was" />
            )}
            <span className="bf-price">
              {off ? <s className="bf-price-was">{moneyShort(listPrice(b.key))}</s> : null}
              {money(b.priceCents)}
            </span>
            <span className="bf-per">
              {b.qty > 1 ? fmt(copy.perBox, { per: money(perBox) }) + " · " : ""}
              {fmt(copy.perBottle, { per: money(Math.round(b.priceCents / (b.qty * perBoxBottles))) })}
            </span>
            <span className="bf-save">{vsOne > 0 ? fmt(copy.vsOne, { save: moneyShort(vsOne) }) : b.compareAtCents && b.compareAtCents > b.priceCents ? fmt(copy.youSave, { save: moneyShort(b.compareAtCents - b.priceCents) }) : ""}</span>
            <span className="bf-radio" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="bf">
      <div className="bf-top">{t(copy.topBar)}</div>
      <header className="bf-nav bf-wrap">
        <a href={bfHref(isBfLocale(locale) ? locale : "de", offer)} className="bf-logo" aria-label="Wine Portugal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light.svg" alt="Wine Portugal" width={961} height={300} />
        </a>
        <LanguageSwitcher compact hrefFor={hrefFor} />
      </header>

      <section className="bf-hero">
        <div className="bf-wrap">
          <p className="bf-kicker">{copy.kicker}</p>
          <h1 className="bf-h1">
            <span className="bf-red">{copy.h1a}</span> <span>{copy.h1b}</span>
          </h1>
          <p className="bf-sub">{copy.sub}</p>
          {/* Price and button at the top (David, 21/11/2026: only ~3 of 100 visitors clicked Buy, the price was below
              the fold). 1 box straight to the checkout; the bundles stay further down. */}
          {open && promoOn && <p className="bf-promo-on">{fmt(PROMO_ON[locale] ?? PROMO_ON.es, { code: leadCode, amount: money(off) })}</p>}
          {open && single && (
            <div className="bf-topbuy">
              <p className="bf-topbuy-price">
                {single.compareAtCents && single.compareAtCents > single.priceCents ? (
                  <span className="bf-topbuy-usual">
                    {copy.usual} <s>{moneyShort(single.compareAtCents)}</s>
                  </span>
                ) : null}
                <b>{money(single.priceCents)}</b>
              </p>
              <p className="bf-topbuy-meta">
                {copy.bundles[single.key]?.title ?? ""} · {copy.bundles[single.key]?.bottles ?? ""} · {fmt(copy.perBottle, { per: money(Math.round(single.priceCents / (single.qty * perBoxBottles))) })}
              </p>
              <button type="button" className="bf-cta" onClick={() => buy(single.key)} disabled={going}>
                {fmt(copy.cta, { price: money(single.priceCents) })}
              </button>
              {(() => {
                const two = bundles.find((b) => b.qty === 2);
                const c = two && copy.bundles[two.key];
                return two && c ? (
                  <a href="#offer" className="bf-topbuy-more" onClick={() => setKey(two.key)}>
                    {c.title} · {money(two.priceCents)}{c.badge ? ` · ${c.badge}` : ""} ↓
                  </a>
                ) : null;
              })()}
            </div>
          )}
          <TrustIcons trust={copy.trust} locale={locale} vars={v} />
          <p className="bf-mix">
            {copy.mix.map((m, i) => (
              <span key={m}>
                {i > 0 && <i aria-hidden="true">●</i>}
                {m}
              </span>
            ))}
          </p>
          <div className="bf-herogrid">
          <div className="bf-heroimg">
            <Gallery images={gallery} alt={copy.productName} ratio={img.heroW / img.heroH}>
              <div className="bf-shipstamp">
                <span aria-hidden="true">🚚</span>
                <b>{copy.freeShip.big}</b>
                <small>{t(copy.freeShip.small)}</small>
              </div>
            </Gallery>
            <ul className="bf-checks bf-checks-hero">
              {copy.checks.map((c) => (
                <li key={c}>{t(c)}</li>
              ))}
            </ul>
          </div>
          <div className="bf-buybox">
          {open ? (
            <div className="bf-countwrap">
              <p className="bf-counttitle">{copy.countdownTitle}</p>
              <Countdown cutoffIso={cutoffIso} units={copy.countdownUnits} onEnd={() => setOpen(false)} />
              <p className="bf-countnote">{t(copy.countdownNote)}</p>
            </div>
          ) : (
            <div className="bf-closed" role="status">
              <b>{copy.closedTitle}</b>
              <p>{copy.closedText}</p>
            </div>
          )}

          {open && bundles.length > 0 && (
            <div className="bf-offer" id="offer">
              {single?.compareAtCents && single.compareAtCents > single.priceCents ? (
                <p className="bf-usual">
                  {copy.usual} <s>{moneyShort(single.compareAtCents)}</s>
                </p>
              ) : null}
              <p className="bf-bigprice">{single ? money(single.priceCents) : priceLabel}</p>
              {promoOn && <p className="bf-promo-on bf-promo-on-light">{fmt(PROMO_ON[locale] ?? PROMO_ON.es, { code: leadCode, amount: money(off) })}</p>}
              <ul className="bf-checks bf-checks-offer">
                {copy.checks.map((c) => (
                  <li key={c}>{t(c)}</li>
                ))}
              </ul>
              {picker}
              <LivePill offer={offerId} locale={locale} />
              <button type="button" className="bf-cta" onClick={() => buy()} disabled={going}>
                {fmt(copy.cta, { price: priceLabel })}
              </button>
              <div className="bf-pay">
                {(["visa", "mastercard", "paypal", "apple-pay", "google-pay"] as const).map((x) => (
                  <span key={x}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/pay/${x}.svg`} alt={PAY_NAMES[x]} title={PAY_NAMES[x]} loading="lazy" />
                  </span>
                ))}
              </div>
            </div>
          )}
          </div>
          </div>
        </div>
      </section>

      <div className="bf-truststrip">
        <div className="bf-wrap">
          {copy.trust.map((x) => (
            <span key={x}>{t(x)}</span>
          ))}
        </div>
      </div>

      <section className="bf-section bf-wines">
        <div className="bf-wrap">
          <h2>{copy.winesTitle}</h2>
          <div className={`bf-winegrid${copy.wines.length === 1 ? " bf-winegrid-one" : ""}`}>
            {copy.wines.map((w) => (
              <article key={w.name} className="bf-wine">
                <div className="bf-wineimg">
                  {w.img && w.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="bf-winephoto" src={w.img} alt={w.name} loading="lazy" />
                  ) : w.img ? (
                    // The pack shots carry a baked cylinder shade and bowed label edges; a contact shadow and soft
                    // reflection ground them.
                    <span className="bf-bottle" style={{ ["--src" as string]: `url(${w.img})` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.img} alt={w.name} loading="lazy" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="bf-bottle-refl" src={w.img} alt="" aria-hidden="true" loading="lazy" />
                    </span>
                  ) : (
                    <span className="bf-wineph" aria-hidden="true" />
                  )}
                  <span className="bf-winecount">{w.count}</span>
                </div>
                <p className="bf-winetype">{w.type}</p>
                <h3>{w.name}</h3>
                <p>{w.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bf-section bf-evening">
        <div className="bf-wrap">
          <h2>{copy.eveningTitle}</h2>
          <div className="bf-evegrid">
            {copy.evening.map((e) => (
              <div key={e.when} className={`bf-eve${e.icon ? " bf-eve-icon" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.icon ? (
                  <span className="bf-eveicon" aria-hidden="true">{e.icon}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.img} alt="" aria-hidden="true" loading="lazy" />
                )}
                <div>
                  <p className="bf-evewhen">{e.when}</p>
                  <h3>{e.wine}</h3>
                  <p>{e.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {copy.producer && (
        <section className="bf-section bf-producer">
          <div className="bf-wrap">
            <h2>{copy.producer.title}</h2>
            <p className="bf-producer-p">{copy.producer.p}</p>
            <ProducerVideo locale={locale} label={copy.producer.label} base="/video/producer/pedro-douro" wideOnly />
            <p className="bf-producer-note">{copy.producer.note}</p>
          </div>
        </section>
      )}

      <section className="bf-section bf-story">
        <div className="bf-wrap">
          <h2>{copy.storyTitle}</h2>
          <ol className="bf-storygrid">
            {copy.story.map((s, i) => (
              <li key={s.h} className="bf-storystep">
                <span className={`bf-storyimg${/-(cut|hero|row)\.webp$/.test(s.img) ? " bf-storyimg-bottles" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt="" aria-hidden="true" loading="lazy" />
                  <b>{i + 1}</b>
                </span>
                <h3>{s.h}</h3>
                <p>{t(s.p)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bf-section bf-why">
        <div className="bf-wrap">
          <h2>{copy.whyTitle}</h2>
          <div className="bf-whygrid">
            {copy.why.map((w) => (
              <div key={w.h}>
                <h3>{w.h}</h3>
                <p>{w.p}</p>
              </div>
            ))}
          </div>
          <h2 className="bf-howh">{copy.howTitle}</h2>
          <ol className="bf-how">
            {copy.how.map((h) => (
              <li key={h}>{t(h)}</li>
            ))}
          </ol>
          {open && (
            <a href="#offer" className="bf-cta bf-cta-inline">
              {fmt(copy.cta, { price: priceLabel })}
            </a>
          )}
        </div>
      </section>

      <section className="bf-section bf-who">
        <div className="bf-wrap bf-whogrid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.who ?? "/lp/bf/who-warehouse.webp"} alt={copy.who.alt} loading="lazy" />
          <div>
            <h2>{copy.whoTitle}</h2>
            <p>{copy.who.p1}</p>
            <p>{copy.who.p2}</p>
            <p className="bf-whocompany">
              <b>{copy.who.company}:</b> {SITE.legalName} · NIF {SITE.nif} · {SITE.address}
              <br />
              {SITE.email} · WhatsApp {SITE.whatsapp}
            </p>
            <a className="bf-wholink" href={`${aboutHref(isBfLocale(locale) ? locale : "de")}?from=${aboutFrom}`}>
              {copy.who.about} →
            </a>
          </div>
        </div>
      </section>

      <section className="bf-section bf-faq">
        <div className="bf-wrap">
          <h2>{copy.faqTitle}</h2>
          {copy.faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{t(f.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="bf-footer">
        <div className="bf-wrap">
          <p>
            <a href={legalHref("terms", locale)}>{copy.legal.terms}</a> · <a href={legalHref("privacy", locale)}>{copy.legal.privacy}</a> · <a href={legalHref("shipping", locale)}>{copy.legal.shipping}</a> · <a href={`${aboutHref(locale)}?from=${aboutFrom}`}>{copy.legal.about}</a>
          </p>
          <p className="bf-small">{copy.footer18}</p>
          <p className="bf-small">© Wine Portugal · wine-portugal.com</p>
        </div>
      </footer>

      {open && <LiveToasts offer={offerId} locale={locale} />}
      {open && <BfSignup locale={locale} amountCents={leadAmountCents} />}

      {open && selected && (
        <div className="bf-sticky">
          <div>
            <b>{copy.bundles[selected.key]?.title ?? ""} · {copy.bundles[selected.key]?.bottles ?? ""}</b>
            <small>{t(copy.checks[1])}</small>
          </div>
          <button type="button" className="bf-cta" onClick={() => buy()} disabled={going}>
            {fmt(copy.ctaSticky, { price: priceLabel })}
          </button>
        </div>
      )}
    </div>
  );
}
