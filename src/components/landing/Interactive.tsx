"use client";

import { useEffect, useRef, useState } from "react";
import { eur } from "@/lib/money";
import { track } from "@/lib/track-client";
import { ProductArt, type ArtKind } from "./ProductArt";
import { totalOf, useBuy } from "./BuyContext";

export type Slide = { kind: ArtKind; alt: string; note: string; src?: string };

export function Gallery({ slides }: { slides: Slide[] }) {
  const [idx, setIdx] = useState(0);
  const track_ = useRef<HTMLDivElement>(null);

  function go(i: number) {
    const el = track_.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  }

  useEffect(() => {
    const el = track_.current;
    if (!el) return;
    const onScroll = () => setIdx(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-gold/30 bg-night shadow-[0_20px_60px_-30px_rgba(15,35,64,0.8)]">
        <div ref={track_} className="no-scrollbar flex aspect-[5/4] snap-x lg:aspect-square snap-mandatory overflow-x-auto" aria-roledescription="carrossel" aria-label="Fotografias do produto">
          {slides.map((s, i) => (
            <figure key={s.kind} className="relative h-full w-full shrink-0 snap-center" aria-roledescription="diapositivo" aria-label={`${i + 1} de ${slides.length}`}>
              {s.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.src} alt={s.alt} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} width={1000} height={1000} />
              ) : (
                <>
                  <ProductArt kind={s.kind} className="h-full w-full" />
                  <span className="sr-only">{s.alt}</span>
                  <figcaption className="absolute bottom-2 left-2 rounded bg-night/75 px-2 py-0.5 text-[10px] uppercase tracking-wider text-paper/90">
                    Ilustração · foto real: {s.note} [[TODO]]
                  </figcaption>
                </>
              )}
            </figure>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.kind} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-gold" : "w-1.5 bg-paper/60"}`} />
          ))}
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {slides.map((s, i) => (
          <button
            key={s.kind}
            type="button"
            onClick={() => go(i)}
            aria-label={`Ver imagem ${i + 1}: ${s.alt}`}
            aria-current={i === idx}
            className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-night transition ${i === idx ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"}`}
          >
            {s.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.src} alt="" className="h-full w-full object-cover" loading="lazy" width={64} height={64} />
            ) : (
              <ProductArt kind={s.kind} className="h-full w-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ cutoffIso, label }: { cutoffIso: string; label: string }) {
  const cutoff = new Date(cutoffIso).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now !== null && now > cutoff) return null;
  const p = parts(now === null ? 0 : cutoff - now);
  const cells: [number, string][] = [
    [p.d, "dias"],
    [p.h, "horas"],
    [p.m, "min"],
    [p.s, "seg"],
  ];
  return (
    <div className="rounded-lg bg-night p-3 text-paper">
      <p className="text-center text-xs uppercase tracking-[0.18em] text-gold">{label}</p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center" aria-live="off">
        {cells.map(([v, l]) => (
          <div key={l} className="rounded bg-white/5 py-1.5">
            <span className="block font-serif text-2xl font-semibold lining-nums tabular-nums leading-none">{now === null ? "··" : String(v).padStart(2, "0")}</span>
            <span className="text-[10px] uppercase tracking-wider text-paper/70">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fires ViewContent once when the product block becomes visible. */
export function ViewContentObserver({ targetId }: { targetId: string }) {
  const { selected } = useBuy();
  const fired = useRef(false);
  const value = totalOf(selected) / 100;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (fired.current || !entries.some((e) => e.isIntersecting)) return;
        fired.current = true;
        track("ViewContent", { content_ids: ["trilogia-2160"], content_type: "product", value: valueRef.current, currency: "EUR" });
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return null;
}

export function StickyCta({ heroCtaId, finalId }: { heroCtaId: string; finalId: string }) {
  const { selected, checkout, loading, mode } = useBuy();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById(heroCtaId);
    const fin = document.getElementById(finalId);
    if (!hero) return;
    let heroOut = false;
    let finalIn = false;
    const update = () => setShow(heroOut && !finalIn);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroOut = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.target === fin) finalIn = e.isIntersecting;
      }
      update();
    });
    io.observe(hero);
    if (fin) io.observe(fin);
    return () => io.disconnect();
  }, [heroCtaId, finalId]);
  if (mode === "closed" || mode === "sold_out") return null;
  const short = selected.label.split(" · ").slice(0, 2).join(" · ");
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-night/95 px-4 py-2.5 text-paper backdrop-blur transition-transform duration-300 lg:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
      aria-hidden={!show}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs text-paper/75">Trilogia 2160 · {short}</p>
          <p className="font-serif text-xl font-semibold">{eur(totalOf(selected))}</p>
        </div>
        <button type="button" onClick={checkout} disabled={loading} tabIndex={show ? 0 : -1} className="btn-primary min-h-11 px-5 text-base">
          {loading ? "A abrir…" : "Encomendar"}
        </button>
      </div>
    </div>
  );
}
