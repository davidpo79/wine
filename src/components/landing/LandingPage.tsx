"use client";

// Rebuild of the approved reference design (trilogia-2160-claude-code-spec.html).
// Markup and class names follow the reference; prices come from the DB bundles and
// the order button opens our checkout (/checkout). WhatsApp stays as a secondary channel.
// All copy comes from the dictionary of the page's language (lib/i18n); the digital recipe
// guide is Portuguese only, so other languages leave it out.

import { Reviews, type ReviewsData } from "./Reviews";
import { SITE } from "@/lib/site";
import { useEffect, useRef, useState } from "react";
import { useBuy, type PublicBundle } from "./BuyContext";
import { ViewContentObserver } from "./Interactive";
import { OpenConsentLink } from "@/components/tracking/Consent";
import { DeadlineCountdown } from "./Countdown";
import { ExitIntent } from "./ExitIntent";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { dealOf, dealText, type Deal } from "@/lib/offers";
import { useI18n } from "@/lib/i18n/client";
import { fmt, Rich } from "@/lib/i18n/rich";
import { legalHref } from "@/lib/i18n/paths";

const WA = "351910348577";

type Offer = {
  b: PublicBundle;
  qty: number;
  price: number;
  compare: number | null;
  saving: number;
  shipping: number;
  freeShipping: boolean;
  deal: Deal;
  text: ReturnType<typeof dealText>;
};

const GALLERY_KEYS = ["giftbox", "arrival", "unboxing", "pouring", "christmas-couple", "table", "guide"] as const;

const img = (key: string) => `/lp/${key}.webp`;
const srcSet = (key: string) => `/lp/${key}-768.webp 768w, /lp/${key}.webp 1536w`;
// German capitalises nouns: lower-casing mid-sentence is only safe in the other languages.
const lowerFirst = (s: string, locale: string) => (locale === "de" ? s : s.charAt(0).toLowerCase() + s.slice(1));

export function LandingPage({
  deliveryDays,
  deliveryTextOverride,
  cutoffLabel,
  cutoffIso,
  exitPopup,
  reviews,
}: {
  deliveryDays: string;
  deliveryTextOverride?: string; // Portugal: the text edited in Admin → Settings
  cutoffLabel: string;
  cutoffIso: string;
  exitPopup: boolean;
  reviews?: ReviewsData;
}) {
  const buy = useBuy();
  const { d, locale, country, money, moneyShort, guide } = useI18n();
  const t = d.lp;
  const m = d.market[country];
  const lower = (x: string) => lowerFirst(x, locale);
  const lc = (x: string) => (locale === "de" ? x : x.toLowerCase());
  const boxes = (n: number) => (n === 1 ? d.common.oneBox : fmt(d.common.nBoxes, { n }));

  const toOffer = (b: PublicBundle, singleCents: number): Offer => {
    const compare = b.compareAtCents && b.compareAtCents > b.priceCents ? b.compareAtCents : null;
    const deal = dealOf(b, singleCents);
    return { b, qty: b.qty, price: b.priceCents, compare, saving: compare ? compare - b.priceCents : 0, shipping: b.shippingCents, freeShipping: b.shippingCents === 0, deal, text: dealText(deal, d.deal, moneyShort) };
  };

  const single = [...buy.bundles].sort((a, b) => a.qty - b.qty)[0];
  const offers = buy.bundles.map((b) => toOffer(b, single.priceCents)).sort((a, b) => a.qty - b.qty);
  const sel = offers.find((o) => o.b.key === buy.selected.key) ?? offers[0];
  const q = sel.qty;
  const canBuy = buy.mode === "open" || buy.mode === "after_christmas";
  const best = offers[offers.length - 1];
  const multi = offers.filter((o) => o.qty >= 2);
  const allFree = offers.every((o) => o.freeShipping);
  const shortOf = (o: Offer) => (o.qty === 1 ? d.common.oneBox : o.text.short);
  const discountLine = multi.map((o) => `${boxes(o.qty)}: ${lc(o.text.short)}`).join(" · ") + (allFree ? ` · ${lc(d.common.deliveryIncluded)}` : "");
  const next = offers.find((o) => o.qty > q);
  const x1 = offers.find((o) => o.qty === 1);
  const gallery = GALLERY_KEYS.filter((k) => guide || k !== "guide");

  const deliveryText = deliveryTextOverride || (deliveryDays ? fmt(m.deliveryText, { days: deliveryDays }) : m.deliveryTextNoDays);
  const prepLine = deliveryDays ? fmt(m.prepLine, { days: deliveryDays }) : m.prepLineNoDays;
  const deliveryFaq = deliveryDays ? fmt(m.deliveryFaq, { days: deliveryDays }) : m.deliveryFaqNoDays;
  const hasMultibanco = country === "PT";

  const promoOff = buy.discount(sel.b);
  const selShip = buy.shipping(sel.b);
  const promoFreeShip = selShip === 0 && sel.shipping > 0;
  const promoCfg = buy.promoConfig;

  // Code from the lead email link (?codigo=NATAL5) is applied automatically.
  useEffect(() => {
    const c = new URLSearchParams(location.search).get("codigo");
    if (c && promoCfg && c.trim().toUpperCase() === promoCfg.code.toUpperCase()) buy.applyPromo(promoCfg.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promoNote =
    buy.promo && promoCfg
      ? promoOff > 0
        ? fmt(t.promoApplied, { code: buy.promo, amount: money(promoOff) }) + (promoFreeShip ? t.promoAppliedFree : "")
        : fmt(t.promoNotEligible, { code: buy.promo, boxes: boxes(promoCfg.maxQty) })
      : null;

  const selectQty = (qty: number) => {
    const o = offers.find((x) => x.qty === qty);
    if (o) buy.select(o.b.key);
  };

  const waMessage = fmt(t.waMessage, {
    boxes: boxes(q),
    guide: guide ? t.waGuide : "",
    total: money(buy.total(sel.b)),
    extra: selShip === 0 ? fmt(t.waExtraIncluded, { sentence: sel.text.sentence ? `${sel.text.sentence}, ` : "" }) : fmt(t.waExtraShipping, { amount: money(selShip) }),
  });
  const waHref = `https://wa.me/${WA}?text=${encodeURIComponent(waMessage)}`;

  // Gallery
  const [gi, setGi] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const show = (i: number) => setGi((i + gallery.length) % gallery.length);
  useEffect(() => {
    const rail = railRef.current;
    const el = rail?.children[gi] as HTMLElement | undefined;
    if (rail && el) rail.scrollLeft = Math.max(0, el.offsetLeft - rail.offsetLeft - rail.clientWidth / 2 + el.offsetWidth / 2);
  }, [gi]);
  const gKey = gallery[gi];
  const g = t.gallery[gKey];

  // Recipe dialog
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const goChoose = () => {
    dialogRef.current?.close();
    document.querySelector<HTMLButtonElement>(`#escolher [data-qty="${q}"]`)?.focus();
    document.querySelector("#escolher")?.scrollIntoView({ behavior: reduced() ? "instant" : "smooth" });
  };

  const total = money(buy.total(sel.b));
  const orderLabel = q === 1 ? fmt(t.orderMine, { total }) : fmt(t.orderN, { qty: q, total });

  const orderButton = (short = false) =>
    canBuy ? (
      <button type="button" className="cta order" data-j={short ? "buy_button_short" : "buy_button"} onClick={buy.checkout} disabled={buy.loading}>
        {buy.loading ? t.opening : short ? fmt(t.orderShort, { total }) : orderLabel}
      </button>
    ) : (
      <a className="cta order" href={`https://wa.me/${WA}`} target="_blank" rel="noopener">
        {t.whatsappTalk}
      </a>
    );

  const bundlesEl = (id: string) => (
    <>
      <div aria-label={t.chooseQtyLabel} className="bundles" role="group" id={id}>
        {offers.map((o) => {
          const active = o.b.key === sel.b.key;
          return (
            <button key={o.b.key} aria-pressed={active} className="bundle" data-qty={o.qty} data-j={`bundle_${o.qty}_boxes`} type="button" onClick={() => selectQty(o.qty)}>
              <span className="bundlebanner">
                {o.qty === 1 && !guide ? d.deal.singleBannerNoGuide : o.text.banner}
                <small>{o.qty === 1 ? (o.freeShipping ? d.common.deliveryIncluded : t.oneBoxToGive) : o.text.small}</small>
              </span>
              <span className={`bundlevisual count${Math.min(o.deal.paid ?? o.qty, 3)}${o.deal.free ? " withgift" : ""}`}>
                {Array.from({ length: Math.min(o.deal.paid ?? o.qty, 3) }).map((_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} alt="" loading="lazy" src={img("box-cutout")} width={600} height={600} />
                ))}
                {/* Pay 3, get 4: the offered box, marked with a gift badge. */}
                {o.deal.free > 0 && (
                  <span className="giftbox">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" loading="lazy" src={img("box-cutout")} width={600} height={600} />
                    <span className="giftcircle">
                      +{o.deal.free}
                      <small>{t.giftWord}</small>
                    </span>
                  </span>
                )}
              </span>
              <span className="bundleicons">{guide ? t.guideFree : t.readyToGive}</span>
              <span className="bundlename">{boxes(o.qty)}</span>
              <span className="bundlecaption">{o.qty === 1 ? t.captionOne : o.qty === 2 ? t.captionTwo : o.deal.paid ? fmt(t.captionPayGet, { qty: o.qty, paid: o.deal.paid }) : t.captionBest}</span>
              <span className="price">{money(o.price)}</span>
              <span className="was">{o.compare ? money(o.compare) : t.pricePerBox}</span>
              <span className="saving">{o.saving ? fmt(t.save, { amount: money(o.saving) }) : d.common.vatIncluded}</span>
              <span className="perbox">
                {o.qty === 1
                  ? buy.shipping(o.b) === 0
                    ? d.common.deliveryIncluded
                    : fmt(t.shippingPlus, { amount: money(o.shipping) })
                  : `${fmt(t.perBox, { amount: money(Math.round(o.price / o.qty)) })}${o.price % o.qty ? "¹" : ""}`}
              </span>
              <span className="choose">
                <span className="radio" />
                <span className="choosetext">{active ? t.selected : t.choose}</span>
              </span>
            </button>
          );
        })}
      </div>
      {offers.some((o) => o.price % o.qty) && (
        <p className="rounding">
          {t.rounding}{" "}
          {offers
            .filter((o) => o.price % o.qty)
            .map((o) => fmt(t.roundingTotal, { boxes: boxes(o.qty), amount: money(o.price) }))
            .join(" ")}
        </p>
      )}
    </>
  );

  const notice = () =>
    buy.mode === "open" ? null : (
      <p className="modenotice">
        {buy.mode === "after_christmas"
          ? t.modeAfterChristmas
          : buy.mode === "sold_out"
            ? t.modeSoldOut
            : buy.mode === "coming_soon"
              ? fmt(t.modeComingSoon, { country: m.area })
              : t.modeClosed}
      </p>
    );

  return (
    <div className="lp">
      <div className="top">
        {fmt(guide ? t.topBar : t.topBarNoGuide, { deal: best.text.short.toUpperCase(), delivery: allFree ? t.topBarDelivery : "" })}
      </div>
      <header className="wrap nav">
        <a className="brand" href="#" aria-label="Wine Portugal">
          <img src="/brand/logo.svg" alt="Wine Portugal" width={961} height={390} />
        </a>
        <nav className="navlinks">
          <LanguageSwitcher compact />
          <a href="#vinhos">{t.nav.what}</a>
          <a href="#duvidas">{t.nav.faq}</a>
          <a href="#escolher">{t.nav.choose}</a>
        </nav>
      </header>
      <div className="benefitbar">
        <span>{allFree ? t.benefitDeliveryAll : t.benefitDeliveryFrom2}</span>
        <span>{t.benefitReady}</span>
        <span>{t.benefitOrigin}</span>
      </div>
      <main>
        <section className="wrap product" id="escolher">
          <div className="gallery">
            <div
              className="mainimage"
              onTouchStart={(e) => (touchX.current = e.changedTouches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                if (Math.abs(dx) > 45) show(gi + (dx < 0 ? 1 : -1));
                touchX.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={g.alt}
                fetchPriority={gi === 0 ? "high" : "auto"}
                id="galleryimage"
                src={img(gKey)}
                srcSet={srcSet(gKey)}
                sizes="(max-width: 760px) 100vw, 620px"
                style={{ objectFit: gKey === "guide" ? "contain" : "cover" }}
              />
              <span className="imagebadge">
                {t.imageBadgeTitle}
                <small>{guide ? t.imageBadgeSub : t.imageBadgeSubNoGuide}</small>
              </span>
              <span className="gallerycaption" id="gallerycaption">
                {g.caption}
              </span>
            </div>
            <div className="albumcontrols">
              <button aria-label={t.prevPhoto} type="button" onClick={() => show(gi - 1)}>
                ←
              </button>
              <span aria-live="polite">
                {gi + 1} / {gallery.length} · {g.label}
              </span>
              <button aria-label={t.nextPhoto} type="button" onClick={() => show(gi + 1)}>
                →
              </button>
            </div>
            <div aria-label={t.albumLabel} className="thumbs" role="group" ref={railRef}>
              {gallery.map((k, i) => (
                <button key={k} aria-label={fmt(t.viewPhoto, { label: t.gallery[k].label })} aria-pressed={i === gi} className={`thumb${k === "guide" ? " guide" : ""}`} type="button" onClick={() => show(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={t.gallery[k].thumbAlt} loading="lazy" src={`/lp/${k}-thumb.webp`} width={90} height={90} />
                  <span>{t.gallery[k].label}</span>
                </button>
              ))}
            </div>
            <div className="galleryfacts">
              {t.facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>

          <div className="summary">
            <div className="eyebrow">{t.eyebrow}</div>
            <h1>
              <Rich s={t.h1} />
            </h1>
            <p className="intro">{guide ? t.intro : t.introNoGuide}</p>
            <ul className="benefits">
              {(guide ? t.benefits : t.benefitsNoGuide).map((b) => (
                <li key={b}>
                  <Rich s={b} />
                </li>
              ))}
            </ul>
            <div className="bundleheading">{t.bundleHeading}</div>
            {bundlesEl("bundles-top")}
            {canBuy && (
              <div className="upgrade">
                <div className="upgradeline">
                  <b>{next ? fmt(t.upgradeNext, { boxes: boxes(next.qty), sentence: lower(next.text.sentence) }) : fmt(t.upgradeDone, { sentence: sel.text.sentence || t.upgradeDoneFallback })}</b>
                  <span>
                    {q} / {offers.length}
                  </span>
                </div>
                <div aria-hidden="true" className="shippingtrack">
                  <div className="shippingfill" style={{ width: `${(q / offers.length) * 100}%` }} />
                </div>
                <div className="milestones">
                  {offers.map((o) => (
                    <span key={o.qty}>{shortOf(o)}</span>
                  ))}
                </div>
                <button id="upgradebutton" type="button" disabled={!next} onClick={() => next && selectQty(next.qty)}>
                  {next ? fmt(t.upgradeButton, { qty: next.qty, short: lc(next.text.short) }) : t.upgradeMax}
                </button>
              </div>
            )}
            {guide && (
              <div className="bonusline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={t.bonusAlt} src="/lp/guide-thumb.webp" width={90} height={127} />
                <div>
                  <b>{t.bonusTitle}</b>
                  <small>{t.bonusSub}</small>
                </div>
                <b>{d.common.free}</b>
              </div>
            )}
            {notice()}
            {promoNote && <p className={`promonote${promoOff ? "" : " muted"}`}>{promoNote}</p>}
            <div id="hero-cta">{orderButton()}</div>
            {buy.mode === "open" && <DeadlineCountdown cutoffIso={cutoffIso} className="countdownline" />}
            {buy.error && (
              <p role="alert" className="ordererror">
                {buy.error}
              </p>
            )}
            <p aria-live="polite" className="shipping">
              {sel.saving
                ? fmt(t.savingLine, { amount: money(sel.saving) }) + (selShip === 0 ? t.deliveryIncludedLine : "")
                : selShip === 0
                  ? t.vatDeliveryIncluded
                  : fmt(t.vatShipping, { amount: money(selShip) })}
            </p>
            <p className="fine">{fmt(t.securePayment, { delivery: buy.mode === "after_christmas" ? fmt(t.afterChristmasDelivery, { country: m.area }) : deliveryText })}</p>
            <div className="payrow">
              {(country === "PT" ? ["MB WAY", "Multibanco"] : country === "NL" ? ["iDEAL"] : country === "BE" ? ["Bancontact"] : []).concat(["Visa", "Mastercard", "Apple Pay", "Google Pay"]).map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            <p className="supportline">
              {t.supportPrefer}{" "}
              <a href={waHref} target="_blank" rel="noopener">
                {t.supportWhatsapp}
              </a>
            </p>
            <LanguageSwitcher />
          </div>
          <ViewContentObserver targetId="escolher" />
        </section>

        <div className="trust">
          <div className="wrap">
            {(guide ? t.trust : [...t.trust.slice(0, 3), t.trustNoGuide]).map(([a, b]) => (
              <div key={a}>
                <strong>{a}</strong>
                {b}
              </div>
            ))}
          </div>
        </div>

        <section className="experience" id="momento">
          <div className="wrap">
            <div className="sectionhead">
              <div className="eyebrow">{t.story.eyebrow}</div>
              <h2>
                <Rich s={t.story.h2} />
              </h2>
              <p>{t.story.lead}</p>
            </div>
            <div className="storyframe">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={t.story.arrivalAlt} loading="lazy" src={img("arrival")} srcSet={srcSet("arrival")} sizes="(max-width: 760px) 100vw, 1060px" />
              <div className="storyframecaption">
                <span>{t.story.arrivalLabel}</span>
                <h3>
                  <Rich s={t.story.arrivalH3} />
                </h3>
              </div>
            </div>
            <div className="storyreading">
              {t.story.reading.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p className="storypivot">{t.story.pivot}</p>
            </div>
            <div className="storychapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={t.story.unboxingAlt} loading="lazy" src={img("unboxing")} srcSet={srcSet("unboxing")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">{t.story.unboxingLabel}</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  <Rich s={t.story.unboxingH2} />
                </h2>
                {t.story.unboxingP.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <p className="imaginedline">{t.story.unboxingLine}</p>
              </div>
            </div>
            <div className="storychapter reversechapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={t.story.pouringAlt} loading="lazy" src={img("pouring")} srcSet={srcSet("pouring")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">{t.story.pouringLabel}</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  <Rich s={t.story.pouringH2} />
                </h2>
                {t.story.pouringP.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
            <div className="storychapter toastchapter">
              <div className="chapterpicture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={t.story.toastAlt} loading="lazy" src={img("christmas-couple")} srcSet={srcSet("christmas-couple")} sizes="(max-width: 760px) 100vw, 520px" />
                <span className="chapternumber">{t.story.toastLabel}</span>
              </div>
              <div className="chaptercopy">
                <h2>
                  <Rich s={t.story.toastH2} />
                </h2>
                <p>{t.story.toastP1}</p>
                <p className="imaginedline">
                  <Rich s={t.story.toastLine} />
                </p>
                <p>{t.story.toastP2}</p>
                <p className="innerthought">{t.story.toastThought}</p>
                <small>{t.story.toastNote}</small>
              </div>
            </div>
            <div className="storyfinish">
              <h3>
                <Rich s={t.story.finishH3} />
              </h3>
              <p>
                <Rich s={t.story.finishP} />
              </p>
              <a className="cta" href="#escolher">
                {t.story.finishCta}
              </a>
              <small>{fmt(guide ? t.story.finishSmall : t.story.finishSmallNoGuide, { price: x1 ? money(x1.price) : "" })}</small>
            </div>
          </div>
        </section>

        <div className="offerribbon">
          <div className="wrap">
            <div>
              <b>{t.ribbonTitle}</b>
              <span>{discountLine}</span>
            </div>
            <a href="#oferta-final">{t.ribbonCta}</a>
          </div>
        </div>

        <section className="section wrap reasons" data-j-section="porque">
          <div className="reasoncopy">
            <div>
              <div className="eyebrow">{t.reasons.eyebrow}</div>
              <h2>
                <Rich s={t.reasons.h2} />
              </h2>
              <p>{t.reasons.p1}</p>
              <p>
                <Rich s={t.reasons.p2} />
              </p>
              <ul className="benefits">
                {(guide ? t.reasons.list : t.reasons.listNoGuide).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <a className="cta sectioncta" href="#escolher">
                {t.reasons.cta}
              </a>
            </div>
          </div>
        </section>

        <section className="section wrap" id="vinhos">
          <div className="split">
            <div>
              <div className="eyebrow">{t.wines.eyebrow}</div>
              <h2>
                <Rich s={t.wines.h2} />
              </h2>
              <p>{t.wines.p}</p>
              <div className="wineitems">
                {(guide ? t.wines.items : t.wines.itemsNoGuide).map(([name, note]) => (
                  <div className="wineitem" key={name}>
                    <b>{name}</b>
                    <small>{note}</small>
                  </div>
                ))}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={t.wines.imageAlt} className="wineimage" loading="lazy" src={img("table")} srcSet="/lp/table-768.webp 768w, /lp/table.webp 1190w" sizes="(max-width: 760px) 100vw, 560px" />
          </div>
        </section>

        {guide && (
          <section className="section bonussection" id="guia">
            <div className="wrap split">
              <div className="bookscene">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={t.guide.imageAlt} loading="lazy" src="/lp/guide-768.webp" />
                <span className="giftbadge">
                  {t.guide.badgeTitle}
                  <small>{t.guide.badgeSub}</small>
                </span>
              </div>
              <div>
                <div className="eyebrow">{t.guide.eyebrow}</div>
                <h2>
                  <Rich s={t.guide.h2} />
                </h2>
                <p>
                  <Rich s={t.guide.p} />
                </p>
                <ul className="benefits">
                  {t.guide.list.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <button className="previewbutton" type="button" onClick={() => dialogRef.current?.showModal()}>
                  {t.guide.preview}
                </button>
                <div className="repeatcta" style={{ margin: "22px 0 0" }}>
                  <a className="cta" href="#escolher">
                    {t.guide.cta}
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="section wrap" data-j-section="comparar">
          <div className="sectionhead">
            <div className="eyebrow">{t.compare.eyebrow}</div>
            <h2>
              <Rich s={t.compare.h2} />
            </h2>
          </div>
          <div className="compare">
            <table>
              <thead>
                <tr>
                  {t.compare.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(guide ? t.compare.rows : t.compare.rowsNoGuide), [...t.compare.multiRow, `✓ ${multi.map((o) => o.text.short).join(" · ")}`]].map(([a, b, c]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td>{b}</td>
                    <td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{t.compare.note}</p>
          </div>
          <div className="repeatcta">
            <a className="cta" href="#escolher">
              {t.compare.cta}
            </a>
            <small>{discountLine}</small>
          </div>
        </section>

        <section className="section ordersteps" data-j-section="como-encomendar">
          <div className="wrap">
            <div className="sectionhead">
              <div className="eyebrow">{t.steps.eyebrow}</div>
              <h2>
                <Rich s={t.steps.h2} />
              </h2>
            </div>
            <div className="stepsrow">
              {t.steps.items.map(([h, p], i) => (
                <div key={h}>
                  <span>{i + 1}</span>
                  <h3>{h}</h3>
                  <p>{fmt(p, { methods: m.methods.charAt(0).toUpperCase() + m.methods.slice(1), guide: guide ? t.steps.guideByEmail : "", shipping: prepLine })}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section closingoffer" id="oferta-final">
          <div className="wrap finalwrap">
            <div className="sectionhead">
              <div className="eyebrow">{t.final.eyebrow}</div>
              <h2>
                <Rich s={t.final.h2} />
              </h2>
              <p>{guide ? t.final.p : t.final.pNoGuide}</p>
            </div>
            {bundlesEl("bundles-final")}
            <div className="finalcheckout">
              {guide && (
                <div className="bonusline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={t.final.bonusAlt} src="/lp/guide-thumb.webp" width={90} height={127} loading="lazy" />
                  <div>
                    <b>{t.final.bonusTitle}</b>
                    <small>{t.final.bonusSub}</small>
                  </div>
                  <b>{d.common.free}</b>
                </div>
              )}
              <div className="summaryrow">
                <span>{fmt(t.final.rowBoxes, { boxes: boxes(q), wines: fmt(d.common.wines, { n: q * 3 }) })}</span>
                <strong>{sel.saving ? fmt(t.save, { amount: money(sel.saving) }) : d.common.vatIncluded}</strong>
              </div>
              {promoOff > 0 && (
                <div className="summaryrow">
                  <span>{fmt(t.final.rowCode, { code: buy.promo ?? "" })}</span>
                  <strong>−{money(promoOff)}</strong>
                </div>
              )}
              {guide && (
                <div className="summaryrow">
                  <span>{t.final.rowGuide}</span>
                  <strong>{d.common.free}</strong>
                </div>
              )}
              <div className="summaryrow">
                <span>{m.shippingRow}</span>
                <strong>{selShip === 0 ? (allFree ? d.common.included : d.common.free) : money(selShip)}</strong>
              </div>
              <div className="summarytotal">
                <span>{d.common.total}</span>
                <strong>{total}</strong>
              </div>
              {notice()}
              {orderButton(true)}
              <p className="fine">{fmt(t.final.fine, { methods: m.methods })}</p>
            </div>
            <p className="deadline">
              <Rich s={t.final.deadline} vars={{ date: cutoffLabel, country: m.area }} />
            </p>
          </div>
        </section>

        {reviews && <Reviews data={reviews} />}

        <section className="section wrap" id="duvidas">
          <div className="faq">
            <h2>{t.faq.title}</h2>
            <details open>
              <summary>{t.faq.whatQ}</summary>
              <p>{guide ? t.faq.whatA : t.faq.whatANoGuide}</p>
            </details>
            {guide && (
              <details>
                <summary>{t.faq.guideQ}</summary>
                <p>{t.faq.guideA}</p>
              </details>
            )}
            <details>
              <summary>{t.faq.deliveryQ}</summary>
              <p>
                {deliveryFaq}
                {allFree ? t.faq.deliveryIncludedAll : x1?.shipping ? fmt(t.faq.deliveryX1, { amount: money(x1.shipping) }) : ""}
                {m.notDelivered}
              </p>
            </details>
            <details>
              <summary>{t.faq.orderQ}</summary>
              <p>
                {fmt(t.faq.orderA, {
                  options: offers.map((o) => o.qty).join(", ").replace(/, (\d+)$/, ` ${d.common.or} $1`),
                  methods: m.methodsLong,
                  extra: hasMultibanco ? t.faq.orderMbNote : t.faq.orderAddressNote,
                })}
              </p>
            </details>
            <details>
              <summary>{t.faq.moreQ}</summary>
              <p>
                {t.faq.moreYes}{" "}
                {offers
                  .map((o) =>
                    o.compare ? fmt(t.faq.moreItem, { boxes: boxes(o.qty), sentence: lower(o.text.sentence), price: money(o.price), compare: money(o.compare) }) : fmt(t.faq.moreSingle, { price: money(o.price) }),
                  )
                  .join(" ")}{" "}
                {allFree ? t.faq.moreDeliveryAll : t.faq.moreDeliveryMulti}
              </p>
            </details>
            <details>
              <summary>{t.faq.cutoffQ}</summary>
              <p>{fmt(t.faq.cutoffA, { date: cutoffLabel, country: m.area, mbNote: hasMultibanco ? t.faq.cutoffMbNote : "" })}</p>
            </details>
            <details>
              <summary>{t.faq.returnQ}</summary>
              <p>
                {t.faq.returnA} <a href={legalHref("shipping", locale)}>{d.common.legal.shipping}</a>.
              </p>
            </details>
            <details>
              <summary>{t.faq.ageQ}</summary>
              <p>{t.faq.ageA}</p>
            </details>
          </div>
          <div className="repeatcta">
            <a className="cta" href="#oferta-final">
              {t.faq.cta}
            </a>
            <small>
              <Rich s={t.faq.ctaSmall} vars={{ date: cutoffLabel, shipping: m.shippingLine }} />
            </small>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap foot">
          <div className="brand">
            <img src="/brand/logo-light.svg" alt="Wine Portugal" width={961} height={390} />
          </div>
          <div>
            <a href="mailto:info@wine-portugal.com">info@wine-portugal.com</a>
            <br />
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener">
              +351 910 348 577
            </a>
          </div>
          <div>
            {d.common.pricesVat}
            <small>{d.common.age18}</small>
          </div>
        </div>
        <div className="wrap footlegal">
          <a href={legalHref("terms", locale)}>{d.common.legal.terms}</a>
          <a href={legalHref("privacy", locale)}>{d.common.legal.privacy}</a>
          <a href={legalHref("shipping", locale)}>{d.common.legal.shipping}</a>
          {country === "PT" && (
            <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">
              {d.common.legal.complaints}
            </a>
          )}
          <OpenConsentLink />
        </div>
        <div className="wrap footentity">
          {SITE.legalName} · NIF {SITE.nif} · {SITE.address}
        </div>
      </footer>

      <div className="sticky">
        <div className="wrap">
          <div>
            <b>{guide ? t.sticky.title : t.sticky.titleNoGuide}</b>
            <small>
              {boxes(q)}
              {sel.qty > 1 && sel.text.short ? ` · ${lc(sel.text.short)}` : ""}
              {promoOff ? fmt(t.sticky.code, { code: buy.promo ?? "" }) : ""}
            </small>
            {buy.mode === "open" && <DeadlineCountdown cutoffIso={cutoffIso} className="stickycount" short />}
          </div>
          <div className="stickright">
            <strong>{total}</strong>
            {canBuy ? (
              <button type="button" className="cta" data-j="buy_button_sticky" onClick={buy.checkout} disabled={buy.loading}>
                {buy.loading ? t.sticky.opening : fmt(t.sticky.order, { total })}
              </button>
            ) : (
              <a className="cta" href={`https://wa.me/${WA}`} target="_blank" rel="noopener">
                WhatsApp ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {guide && (
        <dialog
          aria-labelledby="previewtitle"
          className="previewdialog"
          ref={dialogRef}
          onClick={(e) => {
            const dlg = dialogRef.current;
            if (!dlg || e.target !== dlg) return;
            const r = dlg.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
          }}
        >
          <div className="dialoghead">
            <b>{t.recipe.head}</b>
            <button aria-label={t.recipe.closeLabel} className="dialogclose" type="button" onClick={() => dialogRef.current?.close()}>
              ×
            </button>
          </div>
          <div className="previewbody">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={t.recipe.imageAlt} loading="lazy" src="/lp/recipe-768.webp" />
            <div>
              <div className="eyebrow">{t.recipe.eyebrow}</div>
              <h3 id="previewtitle">
                <Rich s={t.recipe.h3} />
              </h3>
              <p>{t.recipe.p1}</p>
              <p>{t.recipe.p2}</p>
              <button className="cta" type="button" onClick={goChoose}>
                {t.recipe.cta}
              </button>
            </div>
          </div>
        </dialog>
      )}
      {exitPopup && promoCfg && <ExitIntent percent={promoCfg.percent} maxQty={promoCfg.maxQty} />}
    </div>
  );
}
