"use client";

import { useRef } from "react";
import { eur, perBottleCents } from "@/lib/money";
import { totalOf, useBuy, type PublicBundle } from "./BuyContext";

function Boxes({ n, active }: { n: number; active: boolean }) {
  return (
    <svg viewBox="0 0 64 56" className="h-11 w-12 shrink-0" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => {
        const x = 6 + i * 10;
        const y = 22 - i * 8;
        return (
          <g key={i} transform={`translate(${x - (n - 1) * 5} ${y + (n - 1) * 4})`}>
            <rect width="34" height="28" rx="2" fill={active ? "#0F2340" : "#1F4E9C"} stroke="#F6EFE2" strokeWidth="1.5" />
            <rect x="15" width="4" height="28" fill="#9E1B22" />
            <rect y="12" width="34" height="4" fill="#9E1B22" />
          </g>
        );
      })}
    </svg>
  );
}

function splitLabel(label: string) {
  const parts = label.split(" · ");
  return { main: parts.slice(0, 2).join(" · "), sub: parts.slice(2).join(" · ") };
}

export function BundleSelector({ idPrefix }: { idPrefix: string }) {
  const { bundles, selected, select } = useBuy();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent, i: number) {
    let j = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % bundles.length;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + bundles.length) % bundles.length;
    if (j >= 0) {
      e.preventDefault();
      select(bundles[j].key);
      refs.current[j]?.focus();
    }
  }

  return (
    <div role="radiogroup" aria-labelledby={`${idPrefix}-label`} className="space-y-3">
      <p id={`${idPrefix}-label`} className="text-sm font-semibold uppercase tracking-wider text-muted">
        Escolha quantas caixas
      </p>
      {bundles.map((b, i) => (
        <Card key={b.key} b={b} active={b.key === selected.key} onSelect={() => select(b.key)} onKey={(e) => onKey(e, i)} refCb={(el) => (refs.current[i] = el)} />
      ))}
    </div>
  );
}

function Card({ b, active, onSelect, onKey, refCb }: { b: PublicBundle; active: boolean; onSelect: () => void; onKey: (e: React.KeyboardEvent) => void; refCb: (el: HTMLButtonElement | null) => void }) {
  const { main, sub } = splitLabel(b.label);
  const bottles = b.qty * 3;
  const saving = b.compareAtCents ? b.compareAtCents - b.priceCents : 0;
  return (
    <button
      ref={refCb}
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKey}
      className={`relative flex w-full items-center gap-3 rounded-lg border-2 bg-white p-3 text-left transition sm:p-4 ${
        active ? "border-night shadow-[0_6px_24px_-12px_rgba(15,35,64,0.6)]" : "border-paper-2 hover:border-azulejo/50"
      }`}
    >
      {b.badge && (
        <span className={`absolute -top-2.5 right-3 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${active ? "bg-xmas text-white" : "bg-gold text-night"}`}>
          {b.badge}
        </span>
      )}
      <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-night" : "border-muted/50"}`}>
        {active && <span className="h-2.5 w-2.5 rounded-full bg-night" />}
      </span>
      <Boxes n={b.qty} active={active} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight text-night">{main}</span>
        {sub && <span className="block text-sm leading-snug text-muted">{sub}</span>}
        <span className="mt-1 block text-xs text-muted">
          {eur(perBottleCents(b.priceCents, bottles))} por garrafa · {b.shippingCents ? `portes ${eur(b.shippingCents)}` : <strong className="text-azulejo">portes grátis</strong>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-serif text-2xl font-semibold leading-none text-night">{eur(b.priceCents)}</span>
        {b.compareAtCents && (
          <span className="mt-1 block text-xs text-muted">
            <s aria-label={`em vez de ${eur(b.compareAtCents)}, o preço de ${b.qty} caixas avulso`}>{eur(b.compareAtCents)}</s>
          </span>
        )}
        {saving > 0 && <span className="mt-0.5 block text-xs font-semibold text-xmas">Poupa {eur(saving)}</span>}
      </span>
    </button>
  );
}

export function BuyButton({ compact = false }: { compact?: boolean }) {
  const { selected, checkout, loading, mode } = useBuy();
  const disabled = mode === "closed" || mode === "sold_out";
  if (disabled) return null;
  return (
    <button type="button" onClick={checkout} disabled={loading} className={`btn-primary w-full ${compact ? "min-h-12 text-base" : "text-lg"}`}>
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> A abrir pagamento seguro…
        </>
      ) : (
        <>
          Encomendar agora <span aria-hidden="true">·</span> {eur(totalOf(selected))}
        </>
      )}
    </button>
  );
}

export function GiftOptions({ idPrefix }: { idPrefix: string }) {
  const { isGift, setIsGift, giftMessage, setGiftMessage } = useBuy();
  return (
    <div className="rounded-lg border border-paper-2 bg-white/70 p-3">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} className="h-5 w-5 accent-xmas" />
        É para oferecer? Junte uma mensagem.
      </label>
      {isGift && (
        <div className="mt-3">
          <label htmlFor={`${idPrefix}-msg`} className="sr-only">
            Mensagem de oferta
          </label>
          <textarea
            id={`${idPrefix}-msg`}
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value.slice(0, 200))}
            maxLength={200}
            rows={3}
            placeholder="Ex.: Feliz Natal, pai! Para abrirmos juntos na Consoada."
            className="w-full rounded border border-paper-2 bg-white p-2 font-hand text-xl leading-tight text-night placeholder:text-muted/60 focus:border-azulejo focus:outline-none"
          />
          <p className="text-right text-xs text-muted">{giftMessage.length}/200 · No pagamento pode juntar esta mensagem num cartão de Natal impresso.</p>
          <p className="text-xs text-muted">Para enviar diretamente a quem recebe, indique a morada dessa pessoa no passo seguinte.</p>
        </div>
      )}
    </div>
  );
}

export function BuyError() {
  const { error } = useBuy();
  if (!error) return null;
  return (
    <p role="alert" className="rounded border border-xmas/30 bg-xmas/5 p-2 text-sm text-xmas">
      {error}
    </p>
  );
}
