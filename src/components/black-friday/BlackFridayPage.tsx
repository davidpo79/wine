"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { newEventId, track } from "@/lib/track-client";
import { flushJourney, jlog } from "@/lib/journey-client";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/rich";
import { aboutHref, legalHref } from "@/lib/i18n/paths";
import { BF_PRODUCT_SLUG, bfHref, isBfLocale } from "@/lib/black-friday";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import type { BfCopy } from "./copy";

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

export function BlackFridayPage({
  copy,
  bundles,
  cutoffIso,
  cutoffLabel,
  deliveryDays,
  open: openAtLoad,
}: {
  copy: BfCopy;
  bundles: BfBundle[];
  cutoffIso: string;
  cutoffLabel: string;
  deliveryDays: string;
  open: boolean;
}) {
  const { locale, country, money, moneyShort } = useI18n();
  const [open, setOpen] = useState(openAtLoad);
  const [key, setKey] = useState(bundles.find((b) => b.qty === 2)?.key ?? bundles[0]?.key);
  const [going, setGoing] = useState(false);
  const selected = bundles.find((b) => b.key === key) ?? bundles[0];
  const single = bundles.find((b) => b.qty === 1);
  const v = { date: cutoffLabel, days: deliveryDays };
  const t = (s: string) => fmt(s, v);

  useEffect(() => {
    if (selected) track("ViewContent", { content_ids: [BF_PRODUCT_SLUG], content_type: "product", value: selected.priceCents / 100, currency: "EUR" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (k: string) => {
    if (k === key) return;
    setKey(k);
    const b = bundles.find((x) => x.key === k);
    if (b) track("SelectBundle", { bundle_key: b.key, value: b.priceCents / 100, currency: "EUR" });
    jlog("bundle_select", { bundle: k, where: "black_friday" });
  };

  const buy = () => {
    if (!selected || !open || going) return;
    setGoing(true);
    track("AddToCart", { content_ids: [BF_PRODUCT_SLUG], content_type: "product", value: selected.priceCents / 100, currency: "EUR", num_items: selected.qty, bundle_key: selected.key }, newEventId("atc"));
    jlog("click", { label: "checkout_cta", bundle: selected.key, where: "black_friday" });
    flushJourney();
    location.assign(`/checkout?b=${encodeURIComponent(selected.key)}&l=${locale}&c=${country}`);
  };

  const hrefFor = useMemo(() => (l: string) => (isBfLocale(l) ? bfHref(l) : `/${l}`), []);
  const priceLabel = selected ? money(selected.priceCents) : "";

  const picker = (
    <div className="bf-bundles" role="radiogroup" aria-label={copy.cta.replace(" · {price}", "")}>
      {bundles.map((b) => {
        const info = copy.bundles[b.key] ?? { title: `${b.qty}×`, bottles: `${b.qty * 6}` };
        const perBox = Math.round(b.priceCents / b.qty);
        const vsOne = single && b.qty > 1 ? single.priceCents * b.qty - b.priceCents : 0;
        return (
          <button key={b.key} type="button" role="radio" aria-checked={b.key === key} className="bf-bundle" data-qty={b.qty} onClick={() => choose(b.key)}>
            {info.badge ? <span className="bf-badge">{info.badge}</span> : <span className="bf-badge bf-badge-empty" aria-hidden="true" />}
            <span className="bf-btitle">{info.title}</span>
            <span className="bf-bbottles">{info.bottles}</span>
            {b.compareAtCents && b.compareAtCents > b.priceCents ? (
              <span className="bf-was">
                {copy.usual} <s>{moneyShort(b.compareAtCents)}</s>
              </span>
            ) : (
              <span className="bf-was" />
            )}
            <span className="bf-price">{money(b.priceCents)}</span>
            <span className="bf-per">
              {b.qty > 1 ? fmt(copy.perBox, { per: money(perBox) }) + " · " : ""}
              {fmt(copy.perBottle, { per: money(Math.round(b.priceCents / (b.qty * 6))) })}
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
        <a href={bfHref(isBfLocale(locale) ? locale : "de")} className="bf-logo" aria-label="Wine Portugal">
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bf-bottles" src="/lp/bf/bottles.webp" alt={copy.productName} width={1200} height={712} fetchPriority="high" />
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
              <ul className="bf-checks bf-checks-offer">
                {copy.checks.map((c) => (
                  <li key={c}>{t(c)}</li>
                ))}
              </ul>
              {picker}
              <button type="button" className="bf-cta" onClick={buy} disabled={going}>
                {fmt(copy.cta, { price: priceLabel })}
              </button>
              <p className="bf-pay">Visa · Mastercard · Apple Pay · Google Pay</p>
            </div>
          )}
          </div>
          </div>
        </div>
      </section>

      <section className="bf-section bf-wines">
        <div className="bf-wrap">
          <h2>{copy.winesTitle}</h2>
          <div className="bf-winegrid">
            {copy.wines.map((w) => (
              <article key={w.name} className="bf-wine">
                <div className="bf-wineimg">
                  {w.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.img} alt={w.name} loading="lazy" />
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
            <a href={legalHref("terms", locale)}>{copy.legal.terms}</a> · <a href={legalHref("privacy", locale)}>{copy.legal.privacy}</a> · <a href={legalHref("shipping", locale)}>{copy.legal.shipping}</a> · <a href={aboutHref(locale)}>{copy.legal.about}</a>
          </p>
          <p className="bf-small">{copy.footer18}</p>
          <p className="bf-small">© Wine Portugal · wine-portugal.com</p>
        </div>
      </footer>

      {open && selected && (
        <div className="bf-sticky">
          <div>
            <b>{copy.bundles[selected.key]?.title ?? ""} · {copy.bundles[selected.key]?.bottles ?? ""}</b>
            <small>{t(copy.checks[1])}</small>
          </div>
          <button type="button" className="bf-cta" onClick={buy} disabled={going}>
            {fmt(copy.ctaSticky, { price: priceLabel })}
          </button>
        </div>
      )}
    </div>
  );
}
