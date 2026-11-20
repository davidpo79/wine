"use client";

import { useEffect, useState } from "react";
import type { BfOfferId } from "@/lib/black-friday";

// Social proof on the Black Friday pages, from real data only (/api/live): a pill "N people viewing this offer now" in
// the buy box, and small pop-ups of recent real purchases (city, boxes, when) at the bottom. Below the thresholds
// nothing is shown: no invented numbers (EU consumer law).

type Live = { now: number; today: number; sold24: number; customers: number; recent: { city: string; boxes: number; at: string }[] };

const MIN_NOW = 3; // "viewing now" from 3 visits on the offer's pages in the last 10 minutes
const MIN_TODAY = 15; // else "viewed today" from 15
const MIN_SOLD = 3; // "N boxes sold in the last 24 h" from 3
const MIN_CUSTOMERS = 10; // checkout: "N customers have already bought" from 10

type T = { customers: (n: number) => string; now: (n: number) => string; today: (n: number) => string; sold: (n: number) => string; bought: (city: string, n: number) => string; verified: string; rtf: string };
const TEXT: Record<string, T> = {
  es: {
    customers: (n) => `${n} clientes ya han comprado en este Black Friday`,
    now: (n) => `${n} personas están viendo esta oferta ahora`,
    today: (n) => `${n} personas han visto esta oferta hoy`,
    sold: (n) => `${n} cajas vendidas en las últimas 24 h`,
    bought: (c, n) => `Alguien de ${c} compró ${n} ${n === 1 ? "caja" : "cajas"}`,
    verified: "Compra verificada",
    rtf: "es",
  },
  de: {
    customers: (n) => `${n} Kunden haben an diesem Black Friday schon bestellt`,
    now: (n) => `${n} Personen sehen sich dieses Angebot gerade an`,
    today: (n) => `${n} Personen haben dieses Angebot heute angesehen`,
    sold: (n) => `${n} Boxen in den letzten 24 Std. verkauft`,
    bought: (c, n) => `Jemand aus ${c} hat ${n} ${n === 1 ? "Box" : "Boxen"} gekauft`,
    verified: "Verifizierter Kauf",
    rtf: "de",
  },
  nl: {
    customers: (n) => `${n} klanten bestelden al deze Black Friday`,
    now: (n) => `${n} mensen bekijken deze aanbieding nu`,
    today: (n) => `${n} mensen bekeken deze aanbieding vandaag`,
    sold: (n) => `${n} dozen verkocht in de laatste 24 uur`,
    bought: (c, n) => `Iemand uit ${c} kocht ${n} ${n === 1 ? "doos" : "dozen"}`,
    verified: "Geverifieerde aankoop",
    rtf: "nl",
  },
  fr: {
    customers: (n) => `${n} clients ont déjà commandé ce Black Friday`,
    now: (n) => `${n} personnes regardent cette offre en ce moment`,
    today: (n) => `${n} personnes ont vu cette offre aujourd'hui`,
    sold: (n) => `${n} caisses vendues ces dernières 24 h`,
    bought: (c, n) => `Quelqu'un de ${c} a acheté ${n} ${n === 1 ? "caisse" : "caisses"}`,
    verified: "Achat vérifié",
    rtf: "fr",
  },
  pt: {
    customers: (n) => `${n} clientes já compraram neste Black Friday`,
    now: (n) => `${n} pessoas estão a ver esta oferta agora`,
    today: (n) => `${n} pessoas viram esta oferta hoje`,
    sold: (n) => `${n} caixas vendidas nas últimas 24 h`,
    bought: (c, n) => `Alguém de ${c} comprou ${n} ${n === 1 ? "caixa" : "caixas"}`,
    verified: "Compra verificada",
    rtf: "pt-PT",
  },
  ru: {
    customers: (n) => `Уже ${n} покупателей в эту Чёрную пятницу`,
    now: (n) => `${n} чел. сейчас смотрят это предложение`,
    today: (n) => `${n} чел. посмотрели это предложение сегодня`,
    sold: (n) => `Продано коробок за 24 ч: ${n}`,
    bought: (c, n) => `Покупатель из г. ${c}: ${n} ${n === 1 ? "коробка" : n < 5 ? "коробки" : "коробок"}`,
    verified: "Подтверждённая покупка",
    rtf: "ru",
  },
};

function ago(iso: string, lang: string) {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

let shared: Promise<Live | null> | null = null;
const fetchLive = (offer: BfOfferId) =>
  (shared ??= fetch(`/api/live?offer=${offer}`)
    .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
    .catch(() => null));

function useLive(offer: BfOfferId) {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let on = true;
    fetchLive(offer).then((d) => on && setLive(d));
    return () => {
      on = false;
    };
  }, [offer]);
  return live;
}

/** The pill in the buy box: viewers now (or today), and boxes sold in the last 24 hours. */
export function LivePill({ offer, locale }: { offer: BfOfferId; locale: string }) {
  const live = useLive(offer);
  const tx = TEXT[locale] ?? TEXT.es;
  if (!live) return null;
  const lines: string[] = [];
  if (live.now >= MIN_NOW) lines.push(tx.now(live.now));
  else if (live.today >= MIN_TODAY) lines.push(tx.today(live.today));
  if (live.sold24 >= MIN_SOLD) lines.push(tx.sold(live.sold24));
  if (!lines.length) return null;
  return (
    <p className="bf-live" role="status">
      <i aria-hidden="true" />
      {lines.join(" · ")}
    </p>
  );
}

/** Pop-ups of recent real purchases: the first after 7 s, then one every 18 s, each for 6 s; closing stops them. */
export function LiveToasts({ offer, locale }: { offer: BfOfferId; locale: string }) {
  const live = useLive(offer);
  const tx = TEXT[locale] ?? TEXT.es;
  const [i, setI] = useState(-1);
  const [shown, setShown] = useState(false);
  const [off, setOff] = useState(false);
  const recent = live?.recent ?? [];
  useEffect(() => {
    try {
      if (sessionStorage.getItem("bf-live-off")) setOff(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (off || !recent.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    recent.forEach((_, k) => {
      const start = 7000 + k * 18000;
      timers.push(setTimeout(() => (setI(k), setShown(true)), start));
      timers.push(setTimeout(() => setShown(false), start + 6000));
    });
    return () => timers.forEach(clearTimeout);
  }, [off, recent.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = recent[i];
  if (off || !r) return null;
  const close = () => {
    setOff(true);
    try {
      sessionStorage.setItem("bf-live-off", "1");
    } catch {}
  };
  return (
    <div className={`bf-toast${shown ? " bf-toast-in" : ""}`} role="status" aria-live="polite">
      <span className="bf-toast-ico" aria-hidden="true">🍷</span>
      <span className="bf-toast-txt">
        <b>{tx.bought(r.city, r.boxes)}</b>
        <small>
          {ago(r.at, tx.rtf)} · ✓ {tx.verified}
        </small>
      </span>
      <button type="button" className="bf-toast-x" onClick={close} aria-label="×">
        ×
      </button>
    </div>
  );
}

/** Checkout: the real number of Black Friday customers so far (from 10), else nothing. */
export function LiveCustomers({ offer, locale, className }: { offer: BfOfferId; locale: string; className?: string }) {
  const live = useLive(offer);
  const tx = TEXT[locale] ?? TEXT.es;
  if (!live || live.customers < MIN_CUSTOMERS) return null;
  return <p className={className}>{tx.customers(live.customers)}</p>;
}
